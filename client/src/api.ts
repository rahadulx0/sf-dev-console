export async function api<T=any>(path:string, options:RequestInit={}){
  const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  if(!response.ok){const body=await response.json().catch(()=>({error:response.statusText}));throw new Error(body.error||'Request failed')}
  return response.json() as Promise<T>;
}
