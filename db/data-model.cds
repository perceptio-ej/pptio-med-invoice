namespace schemamgr;

@cds.persistence.exists
@cds.persistence.name: 'SCHEMAMGR_MESSAGES'
entity MESSAGES {
  key id            : UUID;
      type          : String(50)   not null;
      payload       : LargeString;
      status        : String(20)   default 'PENDING';
      source_system : String(100);
      target_system : String(100);
      version       : String(10);
      send_at       : Timestamp;
      attempts      : Integer      default 0;
      last_error    : LargeString;
      metadata      : LargeString;
      created_at    : Timestamp;
      updated_at    : Timestamp;
}

@cds.persistence.exists
@cds.persistence.name: 'SCHEMAMGR_EXECUTOR_CONFIG'
@readonly
entity EXECUTOR_CONFIG {
  key message_type : String(50);
      executor_url : String(500);
      active       : Boolean;
      retry_limit  : Integer;
}

@cds.persistence.exists
@cds.persistence.name: 'SCHEMAMGR_HOMOLOGATION_CONTEXT'
@readonly
entity HOMOLOGATION_CONTEXT {
  key id          : UUID;
      context     : String(50) not null;
      description : String(500);
}

@cds.persistence.exists
@cds.persistence.name: 'SCHEMAMGR_HOMOLOGATION_MAP'
@readonly
entity HOMOLOGATION_MAP {
  key id            : UUID;
      context       : String(50)  not null;
      source_system : String(100) not null;
      source_key    : String(200) not null;
      target_system : String(100) not null;
      target_key    : String(200) not null;
      description   : String(500);
}

@cds.persistence.exists
@cds.persistence.name: 'SCHEMAMGR_V_MESSAGES_PENDING'
@readonly
entity V_MESSAGES_PENDING {
  key id            : UUID;
      type          : String(50);
      payload       : LargeString;
      status        : String(20);
      source_system : String(100);
      target_system : String(100);
      version       : String(10);
      send_at       : Timestamp;
      attempts      : Integer;
      metadata      : LargeString;
      created_at    : Timestamp;
      updated_at    : Timestamp;
      executor_url  : String(500);
      retry_limit   : Integer;
}
