export interface Org {alias?:string;username:string;orgId?:string;instanceUrl?:string;isSandbox?:boolean;connectedStatus?:string}
export interface Selection {type:string;members:string[]}
export type Page='overview'|'metadata'|'query'|'apex'|'tests'|'org'|'history'|'saved'|'limits'|'logs'|'packages'|'inspector'|'deploy'|'objects'|'activities'|'capabilities';
