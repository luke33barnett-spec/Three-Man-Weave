export const payoutMultiple=price=>Number.isFinite(price)&&price>0&&price<1?1/price:null;
export function minimumMultiple(maxPrice){
  const value=payoutMultiple(maxPrice);
  return value===null?null:Math.ceil(value*100-1e-9)/100;
}
export function comboMinimum(maxPrice){
  const model=minimumMultiple(maxPrice);
  return model===null?null:Math.max(2,model);
}
export function readMultiple(text){
  const match=String(text).trim().match(/^(\d+(?:\.\d+)?)\s*[x×]?$/i);
  if(!match)return null;
  const value=Number(match[1]);
  return Number.isFinite(value)&&value>1?value:null;
}
export const formatMultiple=value=>Number.isFinite(value)?value.toFixed(2)+'×':'—';
