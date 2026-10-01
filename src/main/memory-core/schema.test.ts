import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {it,expect} from "vitest";
import {ensureDatabaseAuth} from "./database-auth";
import {openMemoryRepository} from "./repository";
import {ENTITY_TABLES} from "./repository-types";
it("rejects mismatched v1 database identity before any schema migration or file change",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"memory-schema-auth-")),databasePath=path.join(root,"memory.sqlite"),key=randomBytes(32);
 try{
  ensureDatabaseAuth(databasePath,key);
  const db=new DatabaseSync(databasePath);
  db.exec("CREATE TABLE memory_metadata(singleton INTEGER PRIMARY KEY,database_id TEXT,key_version INTEGER); INSERT INTO memory_metadata VALUES(1,'different-database-identity',1)");
  for(const table of ENTITY_TABLES)db.exec("CREATE TABLE "+table+" (id TEXT,scope_key TEXT,revision INTEGER,source_id TEXT,parent_id TEXT,state TEXT,payload BLOB)");
  db.exec("CREATE TABLE command_receipts(command_id TEXT,scope_key TEXT,request_digest BLOB,result BLOB); PRAGMA user_version=1");db.close();
  const snapshot=()=>fs.readdirSync(root).sort().map(name=>({name,bytes:fs.readFileSync(path.join(root,name)),mtime:fs.statSync(path.join(root,name)).mtimeMs}));
  const before=snapshot();expect(()=>openMemoryRepository({databasePath,key})).toThrow("MEMORY_DATABASE_AUTH_MISMATCH");expect(snapshot()).toEqual(before);
  const check=new DatabaseSync(databasePath,{readOnly:true});
  try{expect(check.prepare("PRAGMA user_version").get()?.user_version).toBe(1);expect(check.prepare("SELECT name FROM pragma_table_info('current_facts') WHERE name='subject_index'").get()).toBeUndefined()}finally{check.close()}
 }finally{key.fill(0);fs.rmSync(root,{recursive:true,force:true})}
});

it.each(["mismatched-key-version","migrate-empty-v1","refuse-nonempty-facts"])("handles legacy schema boundary %s explicitly",kind=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"memory-schema-v1-")),databasePath=path.join(root,"memory.sqlite"),key=randomBytes(32);
 try{
  const identity=ensureDatabaseAuth(databasePath,key),db=new DatabaseSync(databasePath);
  db.exec("CREATE TABLE memory_metadata(singleton INTEGER PRIMARY KEY,database_id TEXT,key_version INTEGER)");
  db.prepare("INSERT INTO memory_metadata VALUES(1,?,?)").run(identity,kind==="mismatched-key-version"?2:1);
  for(const table of ENTITY_TABLES){
   const parent=table==="candidates"?"evidence":table==="current_facts"?"fact_revisions":null;
   db.exec("CREATE TABLE "+table+" (id TEXT NOT NULL,scope_key TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),source_id TEXT,parent_id TEXT,state TEXT NOT NULL,payload BLOB NOT NULL,PRIMARY KEY(id,scope_key),FOREIGN KEY(source_id,scope_key) REFERENCES sources(id,scope_key)"+(parent?",FOREIGN KEY(parent_id,scope_key) REFERENCES "+parent+"(id,scope_key)":"")+") STRICT");
  }
  db.exec("CREATE TABLE command_receipts(command_id TEXT PRIMARY KEY,scope_key TEXT NOT NULL,request_digest BLOB NOT NULL,result BLOB NOT NULL) STRICT;PRAGMA user_version=1");
  if(kind==="refuse-nonempty-facts")db.prepare("INSERT INTO fact_revisions VALUES('legacy','scope-a',1,NULL,NULL,'recorded',?)").run(Buffer.from("synthetic unsupported legacy payload"));
  db.close();
  const snapshot=()=>fs.readdirSync(root).sort().map(name=>({name,bytes:fs.readFileSync(path.join(root,name)),mtime:fs.statSync(path.join(root,name)).mtimeMs}));
  const before=snapshot();
  if(kind==="migrate-empty-v1"){const repository=openMemoryRepository({databasePath,key});repository.close();const check=new DatabaseSync(databasePath,{readOnly:true});try{expect(check.prepare("PRAGMA user_version").get()?.user_version).toBe(2)}finally{check.close()}}
  else{expect(()=>openMemoryRepository({databasePath,key})).toThrow(kind==="mismatched-key-version"?"MEMORY_DATABASE_AUTH_MISMATCH":"MEMORY_SCHEMA_UNSUPPORTED");expect(snapshot()).toEqual(before)}
 }finally{key.fill(0);fs.rmSync(root,{recursive:true,force:true})}
});
