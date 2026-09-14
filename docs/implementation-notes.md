# Notas de implementación

## Objetos compartidos utilizados

El servicio usa el HDI propio para crear sinónimos hacia el contenedor `pptio-med-db-schema-mgr-hdi`.

| Objeto | Uso actual |
|---|---|
| `EXECUTOR_CONFIG` | Verifica que exista un executor activo para el tipo de mensaje. |
| `MESSAGES` | Detecta duplicados, inserta el payload homologado y consulta su estado. |
| `HOMOLOGATION_CONTEXT` | Verifica la existencia de los contextos obligatorios de homologación. |
| `HOMOLOGATION_MAP` | Resuelve equivalencias TrakCare → SAP. |
| `V_MESSAGES_PENDING` | Queda disponible por sinónimo para el procesador asíncrono. |

## Homologaciones implementadas

El API aplica únicamente equivalencias respaldadas por el DDI:

| Contexto | Campo | Comportamiento |
|---|---|---|
| `DISTRIBUTION_CHANNEL` | `invoice.distributionChannel` | `AMBULATORIO → 10`, `URGENCIAS → 11`, `HOSPITALARIO → 12`. |
| `SALES_OFFICE` | `invoice.salesOffice` | Si llega `1001`, `1002` o `1003`, se acepta directamente. Cualquier otro código requiere una fila aprobada en `HOMOLOGATION_MAP`. |
| `SEGMENT` | `items[].segment` | `PBS → 01`, `PRIVADO → 02`, `ESTADO → 03`, `SOCIAL FCI → 04`, `SOAT → 05`, `ARL → 06`, `INTERNACIONAL → 07`. |
| `STRATEGIC_LINE` | `items[].strategicLine` | `TX → 01`, `MD → 02`, `CV → 03`, `QX → 04`. |
| `SERVICE_TYPE` | `items[].serviceType` | Se transforma solo cuando existe una equivalencia aprobada. El DDI no define los códigos SAP de `MVKE-MVGR5`, por lo que una ausencia de mapeo no bloquea el mensaje. |

No se homologan `customerCode`, `patientBPNumber`, `materialCode`, `plantCode`, `benefitCenter` ni `unitOfMeasure`, porque el DDI los describe como códigos SAP que deben llegar resueltos al API.

## Flujo de creación del pedido

1. Se recibe `POST /api/v1/invoiceExt/salesOrder` con Bearer Token.
2. Se valida metadata, cabecera, posiciones, moneda, fechas y totales.
3. Se identifican los campos que requieren homologación.
4. Se consultan `HOMOLOGATION_CONTEXT` y `HOMOLOGATION_MAP` para `TRAKCARE → SAP_SD`.
5. Se aceptan sin consulta los códigos SAP documentados (`10/11/12`, `1001/1002/1003`, `01–07` y `01–04`).
6. Se consulta `EXECUTOR_CONFIG` para `INVOICE_SALES_ORDER_CREATE`.
7. Se inserta en `MESSAGES.PAYLOAD` el objeto `invoice` ya homologado.
8. `MESSAGES.METADATA` conserva únicamente la metadata recibida y normalizada; no copia la URL del executor ni agrega bloques técnicos de homologación.

## Errores de homologación

- `422`: el valor recibido requiere una equivalencia obligatoria y no existe en `HOMOLOGATION_MAP`.
- `503`: falta un contexto obligatorio en `HOMOLOGATION_CONTEXT`.
- `500`: existen destinos ambiguos para la misma clave o el `TARGET_KEY` no cumple los valores permitidos por el DDI.

## Configuración pendiente de negocio

### Oficina de ventas

El DDI define estos destinos SAP:

- `1001`: Fundación Cardio 163 Norte.
- `1002`: Fundación Cardio 163 Sur.
- `1003`: Fundación Cardio 102.

No define los códigos fuente de TrakCare. Deben cargarse en `HOMOLOGATION_MAP` cuando sean confirmados. No se incluyen ejemplos inventados.

### Tipo de servicio

El DDI menciona `CHEQUEO` e `INTERNACIONAL`, pero no asigna códigos SAP para `MVKE-MVGR5`. El servicio aplica una equivalencia si está configurada; de lo contrario conserva el valor original sin bloquear el flujo.

## Ejecución local

`server.js` crea mocks SQLite y carga únicamente las equivalencias explícitas del DDI para canal de distribución, segmento y línea estratégica. No carga códigos de sede TrakCare ni códigos de tipo de servicio.
