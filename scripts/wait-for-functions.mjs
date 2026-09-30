const functionUrl = `http://127.0.0.1:${process.env.SUPABASE_API_PORT ?? 54321}/functions/v1/complete-session`;
const deadline = Date.now() + 120_000;

async function functionsAreServed() {
  try {
    const response = await fetch(functionUrl, { method: 'OPTIONS' });
    return response.status === 204;
  } catch {
    return false;
  }
}

while (!(await functionsAreServed())) {
  if (Date.now() > deadline) {
    console.error(`Edge functions did not come up at ${functionUrl}`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log('Edge functions are served.');
