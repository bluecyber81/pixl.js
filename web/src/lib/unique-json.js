// JSON.parse accepts duplicate object keys. A checked archive must not.
export function parseUniqueJson(text) {
  let p=0
  const space=()=>{while(/[\x20\t\r\n]/u.test(text[p]||'x'))p++}
  function string(){const start=p++;while(p<text.length){if(text[p]==='\\'){p+=2;continue}if(text[p++]==='"')return JSON.parse(text.slice(start,p))}throw Error('Incomplete JSON string')}
  function value(depth){
    if(depth>64)throw Error('JSON nesting limit');space()
    if(text[p]==='"'){string();return}
    if(text[p]==='{'){
      p++;space();const keys=new Set();if(text[p]==='}'){p++;return}
      while(true){space();if(text[p]!=='"')throw Error('JSON key expected');const key=string();if(keys.has(key))throw Error('Duplicate JSON key');keys.add(key);space();if(text[p++]!==':')throw Error('JSON colon expected');value(depth+1);space();const end=text[p++];if(end==='}')return;if(end!==',')throw Error('JSON comma expected')}
    }
    if(text[p]==='['){p++;space();if(text[p]===']'){p++;return}while(true){value(depth+1);space();const end=text[p++];if(end===']')return;if(end!==',')throw Error('JSON comma expected')}}
    const literal=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(text.slice(p));if(!literal)throw Error('JSON value expected');p+=literal[0].length
  }
  value(0);space();if(p!==text.length)throw Error('Trailing JSON data');return JSON.parse(text)
}
