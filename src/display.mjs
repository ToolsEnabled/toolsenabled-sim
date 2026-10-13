export function displayText(value,max=240){
 const text=String(value??'—').replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu,c=>'\\u'+c.codePointAt(0).toString(16).padStart(4,'0'));
 return text.length>max?text.slice(0,max)+'… [truncated]':text;
}
