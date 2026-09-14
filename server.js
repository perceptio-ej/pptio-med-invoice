'use strict';

const cds = require('@sap/cds');
const log = cds.log('pptio-med-invoice-bootstrap');

/**
 * Production reads the framework objects through HDI synonyms. For `cds watch`
 * in SAP BAS this bootstrap creates SQLite mocks and loads only the equivalences
 * explicitly defined in the DDI. No TrakCare sales-office code is invented: a
 * non-SAP salesOffice requires a real mapping configured by the integration team.
 */
cds.on('served', async () => {
  if (cds.env.requires?.db?.kind !== 'sqlite') return;

  const db = await cds.connect.to('db');

  await db.run(`
    CREATE TABLE IF NOT EXISTS SCHEMAMGR_MESSAGES (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT,
      status TEXT DEFAULT 'PENDING',
      source_system TEXT,
      target_system TEXT,
      version TEXT,
      send_at TEXT,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS SCHEMAMGR_EXECUTOR_CONFIG (
      message_type TEXT PRIMARY KEY,
      executor_url TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      retry_limit INTEGER NOT NULL DEFAULT 3
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS SCHEMAMGR_HOMOLOGATION_CONTEXT (
      id TEXT PRIMARY KEY,
      context TEXT NOT NULL,
      description TEXT
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS SCHEMAMGR_HOMOLOGATION_MAP (
      id TEXT PRIMARY KEY,
      context TEXT NOT NULL,
      source_system TEXT NOT NULL,
      source_key TEXT NOT NULL,
      target_system TEXT NOT NULL,
      target_key TEXT NOT NULL,
      description TEXT
    )
  `);

  await db.run(`
    CREATE VIEW IF NOT EXISTS SCHEMAMGR_V_MESSAGES_PENDING AS
      SELECT
        m.id,
        m.type,
        m.payload,
        m.status,
        m.source_system,
        m.target_system,
        m.version,
        m.send_at,
        m.attempts,
        m.metadata,
        m.created_at,
        m.updated_at,
        e.executor_url,
        e.retry_limit
      FROM SCHEMAMGR_MESSAGES m
      INNER JOIN SCHEMAMGR_EXECUTOR_CONFIG e ON e.message_type = m.type
      WHERE m.status = 'PENDING' AND e.active = 1
  `);

  await db.run(`
    INSERT OR IGNORE INTO SCHEMAMGR_EXECUTOR_CONFIG
      (message_type, executor_url, active, retry_limit)
    VALUES
      ('INVOICE_SALES_ORDER_CREATE', 'http://localhost:4004/mock/sales-order', 1, 3),
      ('INVOICE_DOCUMENT_CREATED', 'http://localhost:4004/mock/document-created', 1, 3)
  `);

  await db.run(`
    INSERT OR IGNORE INTO SCHEMAMGR_HOMOLOGATION_CONTEXT (id, context, description)
    VALUES
      ('10000000-0000-4000-8000-000000000001', 'DISTRIBUTION_CHANNEL', 'Área de atención TrakCare a canal de distribución SAP'),
      ('10000000-0000-4000-8000-000000000002', 'SALES_OFFICE', 'Código de sede TrakCare a oficina de ventas SAP'),
      ('10000000-0000-4000-8000-000000000003', 'SEGMENT', 'Segmento a MVKE-MVGR3'),
      ('10000000-0000-4000-8000-000000000004', 'STRATEGIC_LINE', 'Línea estratégica a MVKE-MVGR4'),
      ('10000000-0000-4000-8000-000000000005', 'SERVICE_TYPE', 'Tipo de servicio a MVKE-MVGR5; códigos pendientes de definición funcional')
  `);

  await db.run(`
    INSERT OR IGNORE INTO SCHEMAMGR_HOMOLOGATION_MAP
      (id, context, source_system, source_key, target_system, target_key, description)
    VALUES
      ('20000000-0000-4000-8000-000000000001', 'DISTRIBUTION_CHANNEL', 'TRAKCARE', 'AMBULATORIO', 'SAP_SD', '10', 'Área de ventas Ambulatorio'),
      ('20000000-0000-4000-8000-000000000002', 'DISTRIBUTION_CHANNEL', 'TRAKCARE', 'URGENCIAS', 'SAP_SD', '11', 'Área de ventas Urgencias'),
      ('20000000-0000-4000-8000-000000000003', 'DISTRIBUTION_CHANNEL', 'TRAKCARE', 'HOSPITALARIO', 'SAP_SD', '12', 'Área de ventas Hospitalario'),
      ('20000000-0000-4000-8000-000000000004', 'SEGMENT', 'TRAKCARE', 'PBS', 'SAP_SD', '01', 'PBS'),
      ('20000000-0000-4000-8000-000000000005', 'SEGMENT', 'TRAKCARE', 'PRIVADO', 'SAP_SD', '02', 'Privado'),
      ('20000000-0000-4000-8000-000000000006', 'SEGMENT', 'TRAKCARE', 'ESTADO', 'SAP_SD', '03', 'Estado'),
      ('20000000-0000-4000-8000-000000000007', 'SEGMENT', 'TRAKCARE', 'SOCIAL FCI', 'SAP_SD', '04', 'Social FCI'),
      ('20000000-0000-4000-8000-000000000008', 'SEGMENT', 'TRAKCARE', 'SOAT', 'SAP_SD', '05', 'SOAT'),
      ('20000000-0000-4000-8000-000000000009', 'SEGMENT', 'TRAKCARE', 'ARL', 'SAP_SD', '06', 'ARL'),
      ('20000000-0000-4000-8000-000000000010', 'SEGMENT', 'TRAKCARE', 'INTERNACIONAL', 'SAP_SD', '07', 'Internacional'),
      ('20000000-0000-4000-8000-000000000011', 'STRATEGIC_LINE', 'TRAKCARE', 'TX', 'SAP_SD', '01', 'Trasplantes'),
      ('20000000-0000-4000-8000-000000000012', 'STRATEGIC_LINE', 'TRAKCARE', 'MD', 'SAP_SD', '02', 'Médica'),
      ('20000000-0000-4000-8000-000000000013', 'STRATEGIC_LINE', 'TRAKCARE', 'CV', 'SAP_SD', '03', 'Cardiovascular'),
      ('20000000-0000-4000-8000-000000000014', 'STRATEGIC_LINE', 'TRAKCARE', 'QX', 'SAP_SD', '04', 'Quirúrgica')
  `);

  log.info('SQLite mock ready with the homologations explicitly defined in the DDI.');
  log.info('SALES_OFFICE source mappings and SERVICE_TYPE target codes must be configured with approved values.');
  log.info('Swagger UI available at /swagger/');
});

module.exports = cds.server;
