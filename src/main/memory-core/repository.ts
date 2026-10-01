import fs from "node:fs";
import path from "node:path";
import {createHmac,hkdfSync,randomUUID,timingSafeEqual} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {ensureDatabaseAuth} from "./database-auth";
import {createMemoryBackup,type MemoryBackupResult} from "./backups";
import {initializeSchema} from "./schema";
import {sealPayload,openPayload} from "./payload-codec";
import {canonicalJson,internalId,entityTable,type BatchCommand,type BatchResult,type EntityTable,type MemoryRow} from "./repository-types";
const STATES=new Set(["recorded","proposed","active","superseded","forgotten","pending","running","complete","invalidated"]);
export class MemoryRepository {
 private closed=false;
 constructor(private readonly db:DatabaseSync,private readonly key:Buffer,private readonly databasePath:string,private readonly databaseId:string,private readonly fault?:(stage:"after-record"|"before-receipt")=>void){}
 private assertOpen(){if(this.closed)throw new Error("MEMORY_REPOSITORY_CLOSED")}
 private binding(table:string,scope:string,id:string){return{recordType:table,id:JSON.stringify([scope,id]),schemaVersion:1,keyVersion:1}}
 private seal(table:string,scope:string,id:string,payload:unknown):Buffer{
  const bytes=Buffer.from(canonicalJson(payload));
  try{return sealPayload(this.key,this.binding(table,scope,id),bytes)}finally{bytes.fill(0)}
 }
 private open(table:string,scope:string,id:string,bytes:Uint8Array):unknown{
  const plain=openPayload(this.key,this.binding(table,scope,id),bytes);
  try{return JSON.parse(plain.toString("utf8"))}finally{plain.fill(0)}
 }
 writeBatch(command:BatchCommand):BatchResult{
  this.assertOpen();internalId(command?.commandId);internalId(command.scopeKey);
  if(!Array.isArray(command.records)||command.records.length===0||command.records.length>1000)throw new Error("MEMORY_INPUT_INVALID");
  const request=Buffer.from(canonicalJson(command));
  if(request.length>8*1024*1024)throw new Error("MEMORY_INPUT_INVALID");
  const receiptKey=Buffer.from(hkdfSync("sha256",this.key,Buffer.alloc(0),"FireflyMemoryReceiptDigest-v1",32));
  let digest:Buffer;try{digest=createHmac("sha256",receiptKey).update(request).digest()}finally{request.fill(0);receiptKey.fill(0)}
  this.db.exec("BEGIN IMMEDIATE");
  try{
   const receipt=this.db.prepare("SELECT scope_key,request_digest,result FROM command_receipts WHERE command_id=?").get(command.commandId);
   if(receipt){
    if(receipt.scope_key!==command.scopeKey||!(receipt.request_digest instanceof Uint8Array)||!timingSafeEqual(digest,receipt.request_digest))throw new Error("MEMORY_COMMAND_CONFLICT");
    const result=this.open("command-receipt",command.scopeKey,command.commandId,receipt.result as Uint8Array) as BatchResult;
    this.db.exec("COMMIT");return result;
   }
   for(const row of command.records){
    entityTable(row.table);internalId(row.id);
    if(!Number.isSafeInteger(row.revision)||row.revision<1)throw new Error("MEMORY_INPUT_INVALID");
    if(row.sourceId!==undefined)internalId(row.sourceId);
    if(row.parentId!==undefined)internalId(row.parentId);
    const state=row.state??"recorded";if(!STATES.has(state))throw new Error("MEMORY_INPUT_INVALID");
    const bytes=this.seal(row.table,command.scopeKey,row.id,row.payload);
    this.db.prepare(`INSERT INTO ${row.table} (id,scope_key,revision,source_id,parent_id,state,payload) VALUES (?,?,?,?,?,?,?)`)
     .run(row.id,command.scopeKey,row.revision,row.sourceId??null,row.parentId??null,state,bytes);
    this.fault?.("after-record");
   }
   const result={inserted:command.records.length};this.fault?.("before-receipt");
   this.db.prepare("INSERT INTO command_receipts VALUES (?,?,?,?)").run(command.commandId,command.scopeKey,digest,this.seal("command-receipt",command.scopeKey,command.commandId,result));
   this.db.exec("COMMIT");return result;
  }catch(error){this.db.exec("ROLLBACK");throw error}
 }
 readRows(table:EntityTable,scopeKey:string):MemoryRow[]{
  this.assertOpen();entityTable(table);internalId(scopeKey);
  return this.db.prepare(`SELECT id,revision,source_id,parent_id,state,payload FROM ${table} WHERE scope_key=? ORDER BY id`).all(scopeKey).map(row=>({
   id:row.id as string,revision:row.revision as number,sourceId:row.source_id as string|null,parentId:row.parent_id as string|null,state:row.state as string,
   payload:this.open(table,scopeKey,row.id as string,row.payload as Uint8Array)
  }));
 }
 async backup(backupId:string=randomUUID()):Promise<MemoryBackupResult>{
  this.assertOpen();return createMemoryBackup({db:this.db,databasePath:this.databasePath,key:this.key,databaseId:this.databaseId,backupId});
 }
 close():void{if(this.closed)return;this.closed=true;try{this.db.close()}finally{this.key.fill(0)}}
}
/** Worker-only entry. Main uses MemoryClient; Renderer never supplies databasePath. */
export function openMemoryRepository(input:{databasePath:string;key:Uint8Array;fault?:(stage:"after-record"|"before-receipt")=>void}):MemoryRepository{
 if(!path.isAbsolute(input.databasePath)||!(input.key instanceof Uint8Array)||input.key.length!==32)throw new Error("MEMORY_INPUT_INVALID");
 const databaseId=ensureDatabaseAuth(input.databasePath,input.key);
 const key=Buffer.from(input.key);let db:DatabaseSync|undefined;
 try{
  db=new DatabaseSync(input.databasePath,{enableForeignKeyConstraints:true,allowExtension:false});
  initializeSchema(db,databaseId);db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
  return new MemoryRepository(db,key,input.databasePath,databaseId,input.fault);
 }catch(error){db?.close();key.fill(0);throw error}
}
