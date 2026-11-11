// Calendar ranges use the backend's shop date, never the browser's timezone.
export function repairPeriods(today) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today||''))return [];
 const [y,m,d]=today.split('-').map(Number);
 const day=(year,month,date=1)=>new Date(Date.UTC(year,month,date)).toISOString().slice(0,10);
 const dow=new Date(today+'T12:00:00Z').getUTCDay();
 return [
  {key:'today',label:'Today',from:today,to:today},
  {key:'week',label:'This week',from:day(y,m-1,d-(dow+1)%7),to:today},
  {key:'month',label:'This Month',from:day(y,m-1),to:today},
  {key:'lastMonth',label:'Last Month',from:day(y,m-2),to:day(y,m-1,0)},
  {key:'three',label:'Last 3 Months',from:day(y,m-3),to:today},
  {key:'six',label:'Last 6 Months',from:day(y,m-6),to:today},
  {key:'year',label:'This Year',from:day(y,0),to:today},
  {key:'lastYear',label:'Last Year',from:day(y-1,0),to:day(y-1,11,31)}
 ];
}
export function jobsInPeriod(jobs,period) {
 return jobs.filter(j=>{const date=String(j.date||'').slice(0,10);return date&&date>=period.from&&date<=period.to;});
}
export function repairCounts(jobs) {
 return {pending:jobs.filter(j=>j.status==='Received').length,complete:jobs.filter(j=>j.status==='Completed'||j.status==='Ready').length,failed:jobs.filter(j=>j.status==='Failed').length};
}
