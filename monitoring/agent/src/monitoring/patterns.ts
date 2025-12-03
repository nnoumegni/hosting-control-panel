// agent/src/monitoring/patterns.ts
export const MaliciousPatterns = [
  // Wordpress brute force
  /wp-login\.php/i,
  /xmlrpc\.php/i,

  // PHP backdoor
  /.*\.php\?.*=/i,
  /eval\(/i,

  // SQL Injection
  /union.*select/i,
  /information_schema/i,
  /or 1=1/i,

  // Path traversal
  /\.\.\//g,

  // Common scanners
  /admin\/?/i,
  /phpmyadmin/i,
  /sqlmanager/i,
  /wp-admin/i,
  /config\.bak/i,
  /config\.old/i,
];
