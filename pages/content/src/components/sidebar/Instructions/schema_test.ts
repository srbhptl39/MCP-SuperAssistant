import { csnToJsonSchema } from './schema_converter';
import { createLogger } from '@extension/shared/lib/logger';

// Test case for nested object parsing

const logger = createLogger('testCsn');

const testCsn =
  'o {p {params:o {p {user_id:s; recipient_email:s r; cc:a[s]; bcc:a[s]; subject:s r; body:s r; is_html:b; attachment:u[o {p {name:s r; mimetype:s r; s3key:s r} ap f}, null]} ap f} r} ap f}';

const result = csnToJsonSchema(testCsn);
logger.debug(JSON.stringify(result, null, 2));
