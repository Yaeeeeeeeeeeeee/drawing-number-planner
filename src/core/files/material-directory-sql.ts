import {MATERIAL_DIRECTORIES, PRODUCTION_CHANGE_DIRECTORIES, SOURCE_MATERIAL_DIRECTORY} from './material-directory-policy.js';

/** Caller supplies a trusted SQL column expression, never user input. */
export function materialDirectoryScopeSql(pathExpression:string, role:'all'|'source'|'production'='all'):string {
  const path=`replace(${pathExpression}, '/', char(92))`;
  const afterCategory=`substr(${path}, instr(${path}, char(92)) + 1)`;
  const afterProduct=`substr(${afterCategory}, instr(${afterCategory}, char(92)) + 1)`;
  const directory=`substr(${afterProduct}, 1, instr(${afterProduct}, char(92)) - 1)`;
  const names=role==='source'?[SOURCE_MATERIAL_DIRECTORY]:role==='production'?PRODUCTION_CHANGE_DIRECTORIES:MATERIAL_DIRECTORIES;
  return `${directory} in (${names.map(name=>`'${name.replaceAll("'", "''")}'`).join(', ')})`;
}
