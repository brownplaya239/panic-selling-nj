async function fetchAllActiveListings() {
  const filter = `MlsStatus Eq 'Active'`;
  let allListings = [];
  const data1 = await sparkFetch('/listings', {_filter:filter,_limit:PAGE_SIZE,_pagination:1,_startat:1});
  const data2 = await sparkFetch('/listings', {_filter:filter,_limit:PAGE_SIZE,_pagination:1,_startat:1001});
  allListings = [...(data1?.D?.Results||[]), ...(data2?.D?.Results||[])];
  console.log(`  Fetched ${allListings.length} active listings from MORMLS`);
  return allListings;
}
