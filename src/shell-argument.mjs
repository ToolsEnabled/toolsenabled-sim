// Human-run command guidance only; these strings are never executed by Sim.
export function shellArgument(value,platform=process.platform){
 const text=String(value);return "'"+(platform==='win32'?text.replaceAll("'","''"):text.replaceAll("'","'\\''"))+"'";
}
