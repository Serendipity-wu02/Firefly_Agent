export interface RecallPolicy {version:string;halfLifeMs:number;archiveThreshold:number;minIdleMs:number;protectExplicitConfirmation:boolean;maintenanceMode:"disabled"|"dry-run"|"enabled";batchSize:number}
export interface StrengthState {lastAccessAt:number|null;decayAnchorAt:number;lastCalculatedAt:number;strengthAtLastCalculation:number}
export interface RecallProtection {pinned:boolean;explicitConfirmation:boolean;required:boolean}
export interface RecallDependency {factId:string;revision:number;visibilityRevision:number}
export interface RecallTransport {recallCommand(command:unknown):Promise<unknown>}
export function recallFail(code:string):never{throw new Error(code)}
