#!/bin/bash

# Default values
CLI_CEB_DEV=false
CLI_CEB_FIREFOX=false

validate_is_boolean() {
  if [[ "$1" != "true" && "$1" != "false" ]]; then
    echo "Invalid value for <$2>. Please use 'true' or 'false'."
    exit 1
  fi
}

# Validate if a key starts with CLI_CEB_ or CEB_
validate_key() {
  local key="$1"
  local is_editable_section="${2:-false}"

  if [[ -n "$key" && ! "$key" =~ ^# ]]; then
    if [[ "$is_editable_section" == true && ! "$key" =~ ^CEB_ ]]; then
      echo "Invalid key: <$key>. All keys in the editable section must start with 'CEB_'."
      exit 1
    elif [[ "$is_editable_section" == false && ! "$key" =~ ^CLI_CEB_ ]]; then
      echo "Invalid key: <$key>. All CLI keys must start with 'CLI_CEB_'."
      exit 1
    fi
  fi
}

parse_arguments() {
  for arg in "$@"
  do
    key="${arg%%=*}"
    value="${arg#*=}"

    validate_key "$key"

    case $key in
      CLI_CEB_DEV)
        CLI_CEB_DEV="$value"
        validate_is_boolean "$CLI_CEB_DEV" "CLI_CEB_DEV"
        ;;
      CLI_CEB_FIREFOX)
        CLI_CEB_FIREFOX="$value"
        validate_is_boolean "$CLI_CEB_FIREFOX" "CLI_CEB_FIREFOX"
        ;;
      *)
        cli_values+=("$key=$value")
        ;;
    esac
  done
}

# Validate keys in .env file
validate_env_keys() {
  if [ ! -f .env ]; then
    return 0
  fi

  while IFS= read -r line; do
    # Skip empty lines and comments
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi
    
    key="${line%%=*}"
    
    # Only validate CLI_CEB_ and CEB_ keys, allow other keys to exist
    if [[ "$key" =~ ^CLI_CEB_ ]]; then
      validate_key "$key" false
    elif [[ "$key" =~ ^CEB_ ]]; then
      validate_key "$key" true
    fi
    # Allow other keys (like FIREBASE_*) without validation
  done < .env
}

create_new_file() {
  temp_file=$(mktemp)

  {
    echo "# THOSE VALUES ARE EDITABLE ONLY VIA CLI"
    echo "CLI_CEB_DEV=$CLI_CEB_DEV"
    echo "CLI_CEB_FIREFOX=$CLI_CEB_FIREFOX"
    for value in "${cli_values[@]}"; do
      echo "$value"
    done
    echo ""
    echo "# THOSE VALUES ARE EDITABLE"

    # Copy existing env values, excluding CLI section
    if [ -f .env ]; then
      # Skip CLI-managed section and preserve everything else
      skip_cli_section=false
      while IFS= read -r line; do
        # Check if we're entering the CLI section
        if [[ "$line" == "# THOSE VALUES ARE EDITABLE ONLY VIA CLI" ]]; then
          skip_cli_section=true
          continue
        fi
        
        # Check if we're exiting the CLI section
        if [[ "$line" == "# THOSE VALUES ARE EDITABLE" ]]; then
          skip_cli_section=false
          continue
        fi
        
        # Skip lines in the CLI section
        if [[ "$skip_cli_section" == true ]]; then
          continue
        fi
        
        # Skip CLI_CEB_ variables (in case they appear outside the CLI section)
        if [[ "$line" =~ ^CLI_CEB_ ]]; then
          continue
        fi
        
        # Preserve all other lines (including FIREBASE_, CEB_, comments, empty lines)
        echo "$line"
      done < .env
    fi
  } > "$temp_file"

  mv "$temp_file" .env
}

# Main script execution
parse_arguments "$@"
validate_env_keys
create_new_file
