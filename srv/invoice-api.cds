namespace com.pptio.med.invoice;

using schemamgr from '../db/data-model';

type MessageMetadata {
  messageId     : String(100) not null;
  sentAt        : DateTime    not null;
  sourceSystem  : String(20)  not null;
  targetSystem  : String(20)  not null;
  version       : String(10)  default '1.0';
  correlationId : String(100);
}

type Money {
  amount   : Decimal(15,2);
  currency : String(3) default 'COP';
}

type InvoiceItem {
  materialCode        : String(18) not null;
  plantCode           : String(4) not null;
  benefitCenter       : String(10);
  unitOfMeasure       : String(3) not null;
  quantity            : Decimal(15,3) not null;
  requestingLocation  : String(25);
  receivingLocation   : String(25);
  cupsDescription     : String(120);
  cucomCode            : String(20);
  unitPrice            : Money;
  moderatingFee        : Money;
  copay                : Money;
  segment              : String(20);
  strategicLine        : String(10);
  serviceType          : String(20);
  consortiumDoctorNit  : String(20);
}

type InvoiceTotals {
  subtotal       : Decimal(15,2) not null;
  totalDiscounts : Decimal(15,2) not null default 0;
  totalTaxes     : Decimal(15,2) not null default 0;
  orderTotal     : Decimal(15,2) not null;
}

type InvoiceData {
  salesOrdType          : String(4)   not null;
  salesOrg              : String(4)   not null;
  distributionChannel   : String(200) not null;
  division              : String(2)   not null;
  salesOffice           : String(200) not null;
  customerCode          : String(10) not null;
  episodeId             : String(20);
  insurerCode           : String(10);
  insurerName           : String(40);
  internalSequence      : String(12);
  referenceDocument     : String(12);
  policyNumber          : String(12);
  admissionDate         : DateTime;
  dischargeDate         : DateTime;
  userType              : String(16);
  stayDays              : Integer;
  patientBPNumber       : String(10);
  patientName           : String(40);
  patientIdType         : String(3);
  patientIdNumber       : String(20);
  patientAge            : Integer;
  patientSex            : String(1);
  patientPhone          : String(18);
  authorizationNumber   : String(30);
  isEmployee            : Boolean default false;
  items                 : many InvoiceItem;
  totals                : InvoiceTotals;
}

type InvoiceReference {
  episodeId     : String(20) not null;
  invoiceNumber : String(30) not null;
}

type SapDocumentResult {
  salesOrderNumber : String(10) not null;
  sapInvoiceNumber : String(20) not null;
  cufe             : String(200);
}

type Acknowledgement {
  messageId   : String(100);
  trackingId  : UUID;
  status      : String(20);
  timestamp   : DateTime;
  description : String(255);
}

type MessageStatus {
  trackingId : UUID;
  type       : String(50);
  status     : String(20);
  attempts   : Integer;
  lastError  : String;
  createdAt  : Timestamp;
  updatedAt  : Timestamp;
}

@protocol: 'rest'
@path: '/api/v1/invoiceExt'
service InvoiceApi {

  @(requires: 'internal-user')
  action salesOrder(
    metadata : MessageMetadata,
    invoice  : InvoiceData
  ) returns Acknowledgement;

  @(requires: 'internal-user')
  action documentCreated(
    metadata         : MessageMetadata,
    invoiceReference : InvoiceReference,
    result           : SapDocumentResult
  ) returns Acknowledgement;

  @(requires: 'internal-user')
  action messageStatus(
    trackingId : UUID not null
  ) returns MessageStatus;
}
