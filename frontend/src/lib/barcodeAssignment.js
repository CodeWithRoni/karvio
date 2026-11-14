import { api } from './api';
export async function assignBarcodes(ids) {
  const unique=[...new Set(ids)], assigned=[];
  for(let i=0;i<unique.length;i+=500) {
    const batch=unique.slice(i,i+500), result=await api('product.barcodes',{ids:batch});
    if(!Array.isArray(result?.assigned) || result.assigned.some((x,j,a)=>!batch.includes(x.id)||!x.barcode||a.findIndex(y=>y.id===x.id)!==j)) throw new Error('The server returned an invalid barcode assignment. Refresh the list before retrying.');
    assigned.push(...result.assigned);
  }
  return assigned;
}
