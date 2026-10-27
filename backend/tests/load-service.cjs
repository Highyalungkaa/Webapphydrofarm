const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
module.exports=function loadService(name){
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/services',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require});
 return exports;
};
