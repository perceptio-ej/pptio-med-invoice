'use strict';

const cds = require('@sap/cds');
const log = cds.log('pptio-med-invoice');
const { SELECT, INSERT } = cds.ql;

const SALES_ORDER_MESSAGE_TYPE = 'INVOICE_SALES_ORDER_CREATE';
const DOCUMENT_CREATED_MESSAGE_TYPE = 'INVOICE_DOCUMENT_CREATED';
const SALES_ORDER_TYPES = new Set(['ZPSA', 'ZPPG', 'ZPPR', 'ZPI1']);

const HOMOLOGATION_CONTEXTS = Object.freeze({
  DISTRIBUTION_CHANNEL: 'DISTRIBUTION_CHANNEL',
  SALES_OFFICE: 'SALES_OFFICE',
  SEGMENT: 'SEGMENT',
  STRATEGIC_LINE: 'STRATEGIC_LINE',
  SERVICE_TYPE: 'SERVICE_TYPE'
});

const VALID_DIRECT_TARGETS = Object.freeze({
  [HOMOLOGATION_CONTEXTS.DISTRIBUTION_CHANNEL]: new Set(['10', '11', '12']),
  [HOMOLOGATION_CONTEXTS.SALES_OFFICE]: new Set(['1001', '1002', '1003']),
  [HOMOLOGATION_CONTEXTS.SEGMENT]: new Set(['01', '02', '03', '04', '05', '06', '07']),
  [HOMOLOGATION_CONTEXTS.STRATEGIC_LINE]: new Set(['01', '02', '03', '04'])
});

module.exports = class InvoiceApiService extends cds.ApplicationService {
  async init() {
    const {
      MESSAGES: Messages,
      EXECUTOR_CONFIG: ExecutorConfig,
      HOMOLOGATION_CONTEXT: HomologationContext,
      HOMOLOGATION_MAP: HomologationMap
    } = cds.entities('schemamgr');

    const setAccepted = (req) => {
      const response = req?.http?.res ?? req?.res;
      if (response && !response.headersSent) response.status(202);
    };

    const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
    const upper = (value) => text(value).toUpperCase();
    const money = (value) => Number(value ?? 0);

    const reject = (req, message, code = 400) => {
      req.reject(code, message);
    };

    const validateMetadata = (req, metadata, expectedSource, expectedTarget) => {
      if (!metadata?.messageId) return reject(req, "El campo 'metadata.messageId' es requerido.");
      if (!metadata?.sentAt) return reject(req, "El campo 'metadata.sentAt' es requerido.");
      if (!metadata?.sourceSystem) return reject(req, "El campo 'metadata.sourceSystem' es requerido.");
      if (!metadata?.targetSystem) return reject(req, "El campo 'metadata.targetSystem' es requerido.");

      const sourceSystem = upper(metadata.sourceSystem);
      const targetSystem = upper(metadata.targetSystem);

      if (expectedSource && sourceSystem !== expectedSource) {
        return reject(req, `metadata.sourceSystem debe ser '${expectedSource}'.`);
      }
      if (expectedTarget && targetSystem !== expectedTarget) {
        return reject(req, `metadata.targetSystem debe ser '${expectedTarget}'.`);
      }

      return {
        messageId: text(metadata.messageId),
        sentAt: metadata.sentAt,
        sourceSystem,
        targetSystem,
        version: text(metadata.version) || '1.0',
        ...(text(metadata.correlationId)
          ? { correlationId: text(metadata.correlationId) }
          : {})
      };
    };

    const validateMoney = (req, value, path) => {
      if (!value) return;
      const amount = money(value.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        reject(req, `El campo '${path}.amount' debe ser un número mayor o igual a cero.`);
        return;
      }
      const currency = upper(value.currency || 'COP');
      if (currency !== 'COP') {
        reject(req, `El campo '${path}.currency' debe ser 'COP'.`);
      }
    };

    const validateInvoice = (req, invoice) => {
      if (!invoice) return reject(req, "El objeto 'invoice' es requerido.");

      const required = [
        ['salesOrdType', invoice.salesOrdType],
        ['salesOrg', invoice.salesOrg],
        ['distributionChannel', invoice.distributionChannel],
        ['division', invoice.division],
        ['salesOffice', invoice.salesOffice],
        ['customerCode', invoice.customerCode]
      ];
      for (const [field, value] of required) {
        if (!text(value)) return reject(req, `El campo 'invoice.${field}' es requerido.`);
      }

      const salesOrdType = upper(invoice.salesOrdType);
      if (!SALES_ORDER_TYPES.has(salesOrdType)) {
        return reject(req, 'invoice.salesOrdType debe ser ZPSA, ZPPG, ZPPR o ZPI1.');
      }

      if (!Array.isArray(invoice.items) || invoice.items.length === 0) {
        return reject(req, "El campo 'invoice.items' debe contener al menos una posición.");
      }

      invoice.items.forEach((item, index) => {
        const base = `invoice.items[${index}]`;
        if (!text(item?.materialCode)) reject(req, `El campo '${base}.materialCode' es requerido.`);
        if (!text(item?.plantCode)) reject(req, `El campo '${base}.plantCode' es requerido.`);
        if (!text(item?.unitOfMeasure)) reject(req, `El campo '${base}.unitOfMeasure' es requerido.`);

        const quantity = Number(item?.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          reject(req, `El campo '${base}.quantity' debe ser mayor que cero.`);
        }

        validateMoney(req, item?.unitPrice, `${base}.unitPrice`);
        validateMoney(req, item?.moderatingFee, `${base}.moderatingFee`);
        validateMoney(req, item?.copay, `${base}.copay`);
      });

      if (!invoice.totals) return reject(req, "El objeto 'invoice.totals' es requerido.");

      const subtotal = money(invoice.totals.subtotal);
      const discounts = money(invoice.totals.totalDiscounts);
      const taxes = money(invoice.totals.totalTaxes);
      const orderTotal = money(invoice.totals.orderTotal);

      for (const [field, value] of [
        ['subtotal', subtotal],
        ['totalDiscounts', discounts],
        ['totalTaxes', taxes],
        ['orderTotal', orderTotal]
      ]) {
        if (!Number.isFinite(value) || value < 0) {
          return reject(req, `El campo 'invoice.totals.${field}' debe ser un número mayor o igual a cero.`);
        }
      }

      const calculatedTotal = subtotal - discounts + taxes;
      if (Math.abs(calculatedTotal - orderTotal) > 0.01) {
        return reject(
          req,
          `invoice.totals.orderTotal (${orderTotal}) no coincide con subtotal - descuentos + impuestos (${calculatedTotal}).`
        );
      }

      if (invoice.stayDays !== null && invoice.stayDays !== undefined && Number(invoice.stayDays) < 0) {
        return reject(req, "El campo 'invoice.stayDays' debe ser mayor o igual a cero.");
      }

      if (invoice.patientAge !== null && invoice.patientAge !== undefined && Number(invoice.patientAge) < 0) {
        return reject(req, "El campo 'invoice.patientAge' debe ser mayor o igual a cero.");
      }

      if (invoice.admissionDate && invoice.dischargeDate) {
        const admission = new Date(invoice.admissionDate);
        const discharge = new Date(invoice.dischargeDate);
        if (admission > discharge) {
          return reject(req, 'invoice.dischargeDate no puede ser anterior a invoice.admissionDate.');
        }
      }

      return {
        ...invoice,
        salesOrdType,
        salesOrg: upper(invoice.salesOrg),
        distributionChannel: upper(invoice.distributionChannel),
        division: upper(invoice.division),
        salesOffice: upper(invoice.salesOffice),
        customerCode: upper(invoice.customerCode),
        isEmployee: Boolean(invoice.isEmployee),
        items: invoice.items.map((item) => ({
          ...item,
          materialCode: upper(item.materialCode),
          plantCode: upper(item.plantCode),
          benefitCenter: item.benefitCenter ? upper(item.benefitCenter) : null,
          unitOfMeasure: upper(item.unitOfMeasure),
          segment: item.segment ? upper(item.segment) : null,
          strategicLine: item.strategicLine ? upper(item.strategicLine) : null,
          serviceType: item.serviceType ? upper(item.serviceType) : null,
          unitPrice: item.unitPrice
            ? { amount: money(item.unitPrice.amount), currency: upper(item.unitPrice.currency || 'COP') }
            : null,
          moderatingFee: item.moderatingFee
            ? { amount: money(item.moderatingFee.amount), currency: upper(item.moderatingFee.currency || 'COP') }
            : null,
          copay: item.copay
            ? { amount: money(item.copay.amount), currency: upper(item.copay.currency || 'COP') }
            : null
        })),
        totals: {
          subtotal,
          totalDiscounts: discounts,
          totalTaxes: taxes,
          orderTotal
        }
      };
    };

    const isDirectTarget = (context, value) => {
      const validValues = VALID_DIRECT_TARGETS[context];
      return Boolean(validValues?.has(upper(value)));
    };

    const validateMappedTarget = (req, context, targetKey) => {
      const target = upper(targetKey);
      const validValues = VALID_DIRECT_TARGETS[context];

      if (validValues && !validValues.has(target)) {
        reject(
          req,
          `La homologación '${context}' tiene un TARGET_KEY no permitido por el DDI: '${target}'.`,
          500
        );
        return null;
      }

      if (context === HOMOLOGATION_CONTEXTS.SERVICE_TYPE && target.length > 3) {
        reject(
          req,
          `La homologación '${context}' debe producir un código SAP de máximo 3 caracteres.`,
          500
        );
        return null;
      }

      return target;
    };

    const applyDocumentedHomologations = async (req, invoice, metadata) => {
      const requests = [];

      const addRequiredRequest = (context, sourceKey, path) => {
        const normalized = upper(sourceKey);
        if (!normalized || isDirectTarget(context, normalized)) return;
        requests.push({ context, sourceKey: normalized, path, required: true });
      };

      const addOptionalRequest = (context, sourceKey, path) => {
        const normalized = upper(sourceKey);
        if (!normalized) return;
        requests.push({ context, sourceKey: normalized, path, required: false });
      };

      addRequiredRequest(
        HOMOLOGATION_CONTEXTS.DISTRIBUTION_CHANNEL,
        invoice.distributionChannel,
        'invoice.distributionChannel'
      );
      addRequiredRequest(
        HOMOLOGATION_CONTEXTS.SALES_OFFICE,
        invoice.salesOffice,
        'invoice.salesOffice'
      );

      invoice.items.forEach((item, index) => {
        addRequiredRequest(
          HOMOLOGATION_CONTEXTS.SEGMENT,
          item.segment,
          `invoice.items[${index}].segment`
        );
        addRequiredRequest(
          HOMOLOGATION_CONTEXTS.STRATEGIC_LINE,
          item.strategicLine,
          `invoice.items[${index}].strategicLine`
        );
        // El DDI exige almacenar el tipo de servicio en MVKE-MVGR5, pero no
        // define los códigos destino. Por eso solo se transforma si existe una
        // equivalencia aprobada; la ausencia de mapeo no bloquea el mensaje.
        addOptionalRequest(
          HOMOLOGATION_CONTEXTS.SERVICE_TYPE,
          item.serviceType,
          `invoice.items[${index}].serviceType`
        );
      });

      if (requests.length === 0) return invoice;

      const contexts = [...new Set(requests.map(({ context }) => context))];
      const tx = cds.tx(req);
      const [contextRows, mapRows] = await Promise.all([
        tx.run(
          SELECT.from(HomologationContext)
            .columns('context')
            .where({ context: { in: contexts } })
        ),
        tx.run(
          SELECT.from(HomologationMap)
            .columns('context', 'source_system', 'source_key', 'target_system', 'target_key')
            .where({ context: { in: contexts } })
        )
      ]);

      const availableContexts = new Set((contextRows || []).map((row) => upper(row.context)));
      const requiredContexts = new Set(
        requests.filter(({ required }) => required).map(({ context }) => context)
      );
      const missingContexts = [...requiredContexts].filter((context) => !availableContexts.has(context));
      if (missingContexts.length > 0) {
        return reject(
          req,
          `Falta configuración en HOMOLOGATION_CONTEXT para: ${missingContexts.join(', ')}.`,
          503
        );
      }

      const candidates = new Map();
      for (const row of mapRows || []) {
        const context = upper(row.context);
        const sourceSystem = upper(row.source_system);
        const targetSystem = upper(row.target_system);
        if (sourceSystem !== metadata.sourceSystem || targetSystem !== metadata.targetSystem) continue;

        const sourceKey = upper(row.source_key);
        const targetKey = upper(row.target_key);
        const key = `${context}|${sourceKey}`;
        if (!candidates.has(key)) candidates.set(key, new Set());
        candidates.get(key).add(targetKey);
      }

      const resolved = new Map();
      const missingMappings = [];

      for (const request of requests) {
        const key = `${request.context}|${request.sourceKey}`;
        const targetCandidates = candidates.get(key) || new Set();

        if (targetCandidates.size > 1) {
          return reject(
            req,
            `La homologación '${request.context}' para '${request.sourceKey}' es ambigua: ${[
              ...targetCandidates
            ].join(', ')}.`,
            500
          );
        }

        if (targetCandidates.size === 0) {
          if (request.required) {
            missingMappings.push(`${request.path}='${request.sourceKey}' (${request.context})`);
          }
          continue;
        }

        const [targetKey] = targetCandidates;
        const validTarget = validateMappedTarget(req, request.context, targetKey);
        if (!validTarget) return null;
        resolved.set(key, validTarget);
      }

      if (missingMappings.length > 0) {
        return reject(
          req,
          `No existe homologación TrakCare → SAP para: ${missingMappings.join('; ')}.`,
          422
        );
      }

      const resolveValue = (context, value) => {
        const normalized = upper(value);
        if (!normalized || isDirectTarget(context, normalized)) return normalized || null;
        return resolved.get(`${context}|${normalized}`) || normalized;
      };

      return {
        ...invoice,
        distributionChannel: resolveValue(
          HOMOLOGATION_CONTEXTS.DISTRIBUTION_CHANNEL,
          invoice.distributionChannel
        ),
        salesOffice: resolveValue(HOMOLOGATION_CONTEXTS.SALES_OFFICE, invoice.salesOffice),
        items: invoice.items.map((item) => ({
          ...item,
          segment: resolveValue(HOMOLOGATION_CONTEXTS.SEGMENT, item.segment),
          strategicLine: resolveValue(HOMOLOGATION_CONTEXTS.STRATEGIC_LINE, item.strategicLine),
          serviceType: resolveValue(HOMOLOGATION_CONTEXTS.SERVICE_TYPE, item.serviceType)
        }))
      };
    };

    const getExecutor = async (req, type) => {
      const tx = cds.tx(req);
      const executor = await tx.run(
        SELECT.one.from(ExecutorConfig).where({ message_type: type, active: true })
      );
      if (!executor) {
        reject(req, `No existe un executor activo para el tipo de mensaje '${type}'.`, 503);
        return null;
      }
      return executor;
    };

    const findDuplicate = async (req, type, externalMessageId) => {
      const tx = cds.tx(req);
      const escapedMessageId = text(externalMessageId).replace(/"/g, '\\"');
      const pattern = `%\"messageId\":\"${escapedMessageId}\"%`;
      return tx.run(
        SELECT.one
          .from(Messages)
          .columns('id', 'status', 'created_at')
          .where({ type, metadata: { like: pattern } })
      );
    };

    const enqueue = async ({ req, type, payload, metadata }) => {
      const tx = cds.tx(req);
      const executor = await getExecutor(req, type);
      if (!executor) return null;

      const duplicate = await findDuplicate(req, type, metadata.messageId);
      if (duplicate) {
        return {
          id: duplicate.id,
          duplicate: true,
          status: duplicate.status || 'PENDING'
        };
      }

      const id = cds.utils.uuid();
      const now = new Date();

      await tx.run(
        INSERT.into(Messages).entries({
          id,
          type,
          payload: JSON.stringify(payload),
          metadata: JSON.stringify(metadata),
          source_system: metadata.sourceSystem,
          target_system: metadata.targetSystem,
          version: metadata.version,
          send_at: metadata.sentAt,
          status: 'PENDING',
          attempts: 0,
          created_at: now,
          updated_at: now
        })
      );

      log.info(
        `Message enqueued: id=${id} type=${type} externalMessageId=${metadata.messageId}`
      );
      return { id, duplicate: false, status: 'PENDING' };
    };

    this.on('salesOrder', async (req) => {
      const metadata = validateMetadata(req, req.data.metadata, 'TRAKCARE', 'SAP_SD');
      if (!metadata) return;

      const validatedInvoice = validateInvoice(req, req.data.invoice);
      if (!validatedInvoice) return;

      const homologatedInvoice = await applyDocumentedHomologations(req, validatedInvoice, metadata);
      if (!homologatedInvoice) return;

      const queued = await enqueue({
        req,
        type: SALES_ORDER_MESSAGE_TYPE,
        payload: homologatedInvoice,
        metadata
      });
      if (!queued) return;

      if (!queued.duplicate) setAccepted(req);

      return {
        messageId: metadata.messageId,
        trackingId: queued.id,
        status: queued.duplicate ? 'DUPLICADO' : 'RECIBIDO',
        timestamp: new Date().toISOString(),
        description: queued.duplicate
          ? 'El mensaje ya había sido recibido. Se retorna el identificador de seguimiento existente.'
          : 'Factura médica recibida, homologada según el DDI y encolada para procesamiento.'
      };
    });

    this.on('documentCreated', async (req) => {
      const metadata = validateMetadata(req, req.data.metadata, 'SAP_SD', 'TRAKCARE');
      if (!metadata) return;

      const invoiceReference = req.data.invoiceReference;
      const result = req.data.result;
      if (!invoiceReference?.episodeId) return reject(req, "El campo 'invoiceReference.episodeId' es requerido.");
      if (!invoiceReference?.invoiceNumber) return reject(req, "El campo 'invoiceReference.invoiceNumber' es requerido.");
      if (!result?.salesOrderNumber) return reject(req, "El campo 'result.salesOrderNumber' es requerido.");
      if (!result?.sapInvoiceNumber) return reject(req, "El campo 'result.sapInvoiceNumber' es requerido.");

      const queued = await enqueue({
        req,
        type: DOCUMENT_CREATED_MESSAGE_TYPE,
        payload: { invoiceReference, result },
        metadata
      });
      if (!queued) return;

      if (!queued.duplicate) setAccepted(req);

      return {
        messageId: metadata.messageId,
        trackingId: queued.id,
        status: queued.duplicate ? 'DUPLICADO' : 'RECIBIDO',
        timestamp: new Date().toISOString(),
        description: queued.duplicate
          ? 'La notificación ya había sido recibida. Se retorna el identificador de seguimiento existente.'
          : 'Notificación de documentos SAP recibida y encolada para actualización de TrakCare.'
      };
    });

    this.on('messageStatus', async (req) => {
      const tx = cds.tx(req);
      const message = await tx.run(
        SELECT.one
          .from(Messages)
          .columns('id', 'type', 'status', 'attempts', 'last_error', 'created_at', 'updated_at')
          .where({ id: req.data.trackingId })
      );

      if (!message) return reject(req, `No se encontró el mensaje '${req.data.trackingId}'.`, 404);

      return {
        trackingId: message.id,
        type: message.type,
        status: message.status,
        attempts: message.attempts,
        lastError: message.last_error,
        createdAt: message.created_at,
        updatedAt: message.updated_at
      };
    });

    return super.init();
  }
};
