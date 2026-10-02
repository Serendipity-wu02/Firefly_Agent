export function dispatchMainEntry(diagnostic: boolean, paths: { diagnostic():void; ordinary():void }):void {
  if (diagnostic) paths.diagnostic();
  else paths.ordinary();
}
