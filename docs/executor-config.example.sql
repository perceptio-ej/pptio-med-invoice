-- Ejecutar en el contenedor propietario pptio-med-db-schema-mgr-hdi.
-- Ajustar las URL a los executors reales antes del despliegue productivo.

UPSERT EXECUTOR_CONFIG
  (MESSAGE_TYPE, EXECUTOR_URL, ACTIVE, RETRY_LIMIT)
VALUES
  ('INVOICE_SALES_ORDER_CREATE', 'https://<host-executor>/api/v1/executor/sales-order', TRUE, 3)
WITH PRIMARY KEY;

UPSERT EXECUTOR_CONFIG
  (MESSAGE_TYPE, EXECUTOR_URL, ACTIVE, RETRY_LIMIT)
VALUES
  ('INVOICE_DOCUMENT_CREATED', 'https://<host-executor>/api/v1/executor/trakcare-document', TRUE, 3)
WITH PRIMARY KEY;
