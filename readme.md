# PPTIO Medical Invoice

Servicio SAP CAP Node.js para recibir facturas médicas desde TrakCare, aplicar las homologaciones definidas en el DDI y registrar el mensaje en el framework compartido para crear de forma asíncrona el Pedido de Venta en SAP S/4HANA.

## Homologaciones aplicadas en `salesOrder`

| Campo | Contexto | Equivalencias |
|---|---|---|
| `distributionChannel` | `DISTRIBUTION_CHANNEL` | `AMBULATORIO → 10`, `URGENCIAS → 11`, `HOSPITALARIO → 12`. |
| `salesOffice` | `SALES_OFFICE` | Acepta directamente `1001`, `1002` y `1003`; cualquier código TrakCare distinto debe estar configurado. |
| `items[].segment` | `SEGMENT` | `PBS → 01`, `PRIVADO → 02`, `ESTADO → 03`, `SOCIAL FCI → 04`, `SOAT → 05`, `ARL → 06`, `INTERNACIONAL → 07`. |
| `items[].strategicLine` | `STRATEGIC_LINE` | `TX → 01`, `MD → 02`, `CV → 03`, `QX → 04`. |
| `items[].serviceType` | `SERVICE_TYPE` | Solo se transforma si existe una equivalencia aprobada; el DDI no define los códigos de `MVKE-MVGR5`. |

`customerCode`, `patientBPNumber`, `materialCode`, `plantCode`, `benefitCenter` y `unitOfMeasure` deben llegar como códigos SAP y no se homologan en este API.

## Integración con el esquema compartido

| Objeto | Uso en `pptio-med-invoice` |
|---|---|
| `MESSAGES` | Escritura, detección de duplicados y consulta de estado. |
| `EXECUTOR_CONFIG` | Lectura del executor activo y del límite de reintentos. |
| `HOMOLOGATION_CONTEXT` | Validación de contextos requeridos. |
| `HOMOLOGATION_MAP` | Lectura de equivalencias TrakCare → SAP. |
| `V_MESSAGES_PENDING` | Disponible por sinónimo para el consumidor asíncrono. |

## Endpoints REST

| Método | Ruta | Autorización | Descripción |
|---|---|---|---|
| POST | `/api/v1/invoiceExt/salesOrder` | Bearer JWT (`internal-user`) | Valida, homologa y encola la factura como `INVOICE_SALES_ORDER_CREATE`. |
| POST | `/api/v1/invoiceExt/documentCreated` | Bearer JWT (`internal-user`) | Encola el retorno SAP como `INVOICE_DOCUMENT_CREATED`. |
| POST | `/api/v1/invoiceExt/messageStatus` | Bearer JWT (`internal-user`) | Consulta el estado por `trackingId`. |

## Probar visualmente en SAP BAS

```bash
npm install
npm run watch
```

Abra el puerto `4004` y navegue a `/swagger/`.

En Cloud Foundry, seleccione **Authorize** y pegue el JWT en `bearerAuth`:

```http
Authorization: Bearer <JWT>
```

## Respuestas principales de `salesOrder`

- `202`: mensaje homologado y encolado.
- `200`: mensaje duplicado; retorna el `trackingId` existente.
- `400`: estructura o validación funcional inválida.
- `401`: no se recibió un token válido.
- `403`: el token no corresponde a un cliente técnico interno autorizado.
- `422`: falta una equivalencia obligatoria.
- `503`: falta el executor activo o un contexto obligatorio de homologación.

## Configuración HANA

Ejecute y revise:

```text
docs/homologation-config.example.sql
```

El script contiene únicamente equivalencias explícitas del DDI. Las claves fuente de sede TrakCare y los códigos destino de tipo de servicio siguen pendientes de confirmación y no se inventan.

También debe existir un executor activo:

```text
MESSAGE_TYPE = INVOICE_SALES_ORDER_CREATE
```

## Compilar y desplegar

```bash
npm install
mbt build -p cf
cf deploy mta_archives/pptio-med-invoice_1.0.0.mtar -f
```
