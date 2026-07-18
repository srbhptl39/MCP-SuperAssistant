#!/usr/bin/env python3
"""Reload the MCP SuperAssistant unpacked Chrome extension in one command.

Drives Chrome through the `cua-driver` CLI without stealing foreground focus.

Primary path: click the "Update" button in the chrome://extensions toolbar,
which reloads ALL unpacked extensions (unambiguous, ideal for the dev loop).
Fallback (`--card-reload`): click the per-extension "Reload" button for --id.

Both act and verify through cua-driver's `page` tool (Apple Events JS against
the chrome://extensions WebUI). We deliberately do NOT use the AX-snapshot /
element_index path: on Chrome instances with a large History menu the
extensions window's content AX subtree gets crowded out / torn down
(cua-driver issue #22865) and window screenshots fail, so element_index clicks
are unreliable. The JS path is deterministic and is still a native cua-driver
capability. Verification re-reads the card via JS (no error, service-worker
view present) — the "re-snapshot to confirm" half of the loop.

Usage:
  python3 scripts/reload-extension.py [--id EXT_ID] [--card-reload]

Requires the cua-driver daemon running:  open -n -g -a CuaDriver --args serve
"""
import argparse
import json
import subprocess
import sys
import time

DEFAULT_ID = "pekpinkkblnkmkmbegmflaecchiojgkd"
CHROME_BUNDLE = "com.google.Chrome"
EXT_URL_PREFIX = "chrome://extensions"


def die(msg, code=1):
    print(f"reload-extension: {msg}", file=sys.stderr)
    sys.exit(code)


def cua(cmd: str, args: dict) -> dict:
    """Run `cua-driver <cmd> '<json>'` and return its output parsed as JSON.

    The `page` tool prints the JS return value verbatim; all our JS returns a
    JSON string, so json parsing is uniform. Fails loudly on any error.
    """
    try:
        p = subprocess.run(
            ["cua-driver", cmd, json.dumps(args)],
            capture_output=True, text=True, timeout=45,
        )
    except FileNotFoundError:
        die("cua-driver is not on PATH. Install it, then `cua-driver serve`.")
    except subprocess.TimeoutExpired:
        die(f"cua-driver {cmd} timed out.")
    out = (p.stdout or "").strip()
    if p.returncode != 0:
        die(f"cua-driver {cmd} failed (exit {p.returncode}): "
            f"{(p.stderr or '').strip() or out or 'no output'}")
    if not out:
        return {}
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        die(f"cua-driver {cmd} returned non-JSON output: {out[:300]}")


def ensure_daemon():
    try:
        p = subprocess.run(["cua-driver", "status"],
                           capture_output=True, text=True, timeout=15)
    except FileNotFoundError:
        die("cua-driver is not on PATH. Install it, then `cua-driver serve`.")
    if p.returncode != 0 or "running" not in (p.stdout + p.stderr).lower():
        die("cua-driver daemon is not running. Start it with:\n"
            "  open -n -g -a CuaDriver --args serve")


def page_js(pid: int, window_id: int, js: str) -> dict:
    return cua("page", {"pid": pid, "window_id": window_id,
                        "action": "execute_javascript", "javascript": js})


def find_chrome_pid() -> int:
    for a in cua("list_apps", {}).get("apps", []):
        if a.get("bundle_id") == CHROME_BUNDLE and a.get("pid"):
            return a["pid"]
    die("Google Chrome is not running.")


def onscreen_windows(pid: int) -> list:
    ws = cua("list_windows", {"pid": pid}).get("windows", [])
    return [w for w in ws if w.get("is_on_screen") and w.get("window_id")]


def find_ext_window(pid: int, windows: list):
    """Return the window_id whose active tab is on chrome://extensions."""
    probe = ("(function(){try{return JSON.stringify({href:location.href});}"
             "catch(e){return JSON.stringify({href:''});}})()")
    for w in windows:
        wid = w["window_id"]
        href = page_js(pid, wid, probe).get("href", "")
        if href.startswith(EXT_URL_PREFIX):
            return wid
    return None


def navigate_to_card(pid: int, wid: int, ext_id: str):
    """Same-page nav to the extension's detail view (the ?id= card)."""
    js = ("(function(){try{location.assign('chrome://extensions/?id="
          + ext_id + "');return JSON.stringify({ok:true});}"
          "catch(e){return JSON.stringify({ok:false,error:''+e});}})()")
    page_js(pid, wid, js)
    time.sleep(1.2)


def reload_js(mode: str) -> str:
    # mode: "update" (toolbar, all unpacked) or "card" (this extension only)
    return """
(function(){
 function J(o){return JSON.stringify(o);}
 try{
  var mgr=document.querySelector('extensions-manager');
  if(!mgr||!mgr.shadowRoot) return J({ok:false,error:'extensions-manager not found'});
  var sr=mgr.shadowRoot;
  if('%s'==='card'){
    var dv=sr.querySelector('extensions-detail-view');
    if(!dv||!dv.shadowRoot) return J({ok:false,error:'detail view not open (navigate to ?id= first)'});
    var rel=dv.shadowRoot.querySelector('#dev-reload-button');
    if(!rel) return J({ok:false,error:'per-card Reload button not present'});
    if(rel.hidden) return J({ok:false,devmode:false,error:'Developer mode is OFF (per-card Reload hidden)'});
    var n=dv.shadowRoot.querySelector('#name');
    rel.click();
    return J({ok:true,mode:'card',name:n?n.textContent.trim():null});
  } else {
    var tb=sr.querySelector('extensions-toolbar');
    if(!tb||!tb.shadowRoot) return J({ok:false,error:'toolbar not found'});
    var upd=tb.shadowRoot.querySelector('#updateNow');
    if(!upd) return J({ok:false,error:'Update button not present'});
    if(upd.hidden) return J({ok:false,devmode:false,error:'Developer mode is OFF (Update button hidden)'});
    upd.click();
    return J({ok:true,mode:'update'});
  }
 }catch(e){return J({ok:false,error:''+e});}
})()
""" % mode


VERIFY_JS = """
(function(){
 try{
  var mgr=document.querySelector('extensions-manager');
  var sr=mgr.shadowRoot;
  var ct=sr.querySelector('cr-toast');
  var dv=sr.querySelector('extensions-detail-view');
  var out={ok:true};
  out.toast = ct?((ct.textContent||'').trim()||null):null;
  if(dv&&dv.shadowRoot){
    var d=dv.shadowRoot;
    var rel=d.querySelector('#dev-reload-button');
    out.reloadBtnVisible = rel? !rel.hidden : null;
    var n=d.querySelector('#name'); out.name=n?n.textContent.trim():null;
    out.errorPresent = !!d.querySelector('#load-error, .error-message, extensions-load-error');
    var v=[]; d.querySelectorAll('#inspect-views a, #inspect-views li').forEach(function(a){v.push((a.textContent||'').trim());});
    out.inspectViews=v;
  }
  return JSON.stringify(out);
 }catch(e){return JSON.stringify({ok:false,error:''+e});}
})()
"""


def main():
    ap = argparse.ArgumentParser(description="Reload the MCP SuperAssistant unpacked Chrome extension via cua-driver.")
    ap.add_argument("--id", default=DEFAULT_ID, help="extension id (default: MCP SuperAssistant)")
    ap.add_argument("--card-reload", action="store_true",
                    help="use the per-extension Reload button instead of the toolbar Update button")
    args = ap.parse_args()

    ensure_daemon()
    pid = find_chrome_pid()
    wins = onscreen_windows(pid)
    if not wins:
        die("Chrome has no on-screen window.")

    wid = find_ext_window(pid, wins)
    if wid is None:
        die("No Chrome window is showing chrome://extensions. "
            "Open chrome://extensions in Chrome and retry.")

    # Step: navigate to the extension's card (satisfies "navigate to ?id=<id>")
    navigate_to_card(pid, wid, args.id)

    mode = "card" if args.card_reload else "update"
    pre = page_js(pid, wid, reload_js(mode))
    if not pre.get("ok"):
        # Dev-mode-off is surfaced as a specific, actionable diagnosis.
        die(pre.get("error", "reload action failed"))

    time.sleep(2)  # let the update/reload settle
    post = page_js(pid, wid, VERIFY_JS)
    if not post.get("ok"):
        die(f"post-reload verification could not read the page: {post.get('error')}")
    if post.get("errorPresent"):
        die("reload left the extension in an ERROR state (check chrome://extensions).")
    if post.get("reloadBtnVisible") is False:
        die("post-reload check failed: Developer mode appears OFF / card missing.")

    name = post.get("name") or args.id
    sw = "service worker present" if any("service worker" in v for v in post.get("inspectViews", [])) else "no service-worker view"
    print(f"Reloaded '{name}' via {mode} button — no errors, {sw}.")
    sys.exit(0)


if __name__ == "__main__":
    main()
