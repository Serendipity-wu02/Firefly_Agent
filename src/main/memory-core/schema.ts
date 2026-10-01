import type {DatabaseSync} from "node:sqlite";
import {ENTITY_TABLES} from "./repository-types";
export const MEMORY_SCHEMA_VERSION=1;
export function initializeSchema(db:DatabaseSync,databaseId:string):void{
 const version=db.prepare("PRAGMA user_version").get()?.user_version;
 if(version!==0&&version!==MEMORY_SCHEMA_VERSION)throw new Error("MEMORY_SCHEMA_UNSUPPORTED");
 if(version===0){
  const existing=db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
  if(existing?.n!==0)throw new Error("MEMORY_SCHEMA_UNSUPPORTED");
  db.exec("BEGIN IMMEDIATE");
  try{
   db.exec("CREATE TABLE memory_metadata (singleton INTEGER PRIMARY KEY CHECK(singleton=1), database_id TEXT NOT NULL, key_version INTEGER NOT NULL CHECK(key_version=1)) STRICT");
   db.prepare("INSERT INTO memory_metadata VALUES (1,?,1)").run(databaseId);
   for(const table of ENTITY_TABLES){
    const parent=table==="candidates"?"evidence":table==="current_facts"?"fact_revisions":null;
    db.exec(`CREATE TABLE ${table} (
     id TEXT NOT NULL, scope_key TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
     source_id TEXT, parent_id TEXT, state TEXT NOT NULL, payload BLOB NOT NULL,
     PRIMARY KEY(id,scope_key),
     FOREIGN KEY(source_id,scope_key) REFERENCES sources(id,scope_key)
     ${parent?", FOREIGN KEY(parent_id,scope_key) REFERENCES "+parent+"(id,scope_key)":""}
    ) STRICT`);
   }
   db.exec("CREATE TABLE command_receipts (command_id TEXT PRIMARY KEY, scope_key TEXT NOT NULL, request_digest BLOB NOT NULL, result BLOB NOT NULL) STRICT");
   db.exec("PRAGMA user_version=1; COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error}
 }
 const metadata=db.prepare("SELECT database_id,key_version FROM memory_metadata WHERE singleton=1").get();
 if(metadata?.database_id!==databaseId||metadata.key_version!==1)throw new Error("MEMORY_DATABASE_AUTH_MISMATCH");
}
