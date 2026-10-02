import { login } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h1>Sign in</h1>
      <p>Stub sign-in: the username alone starts a session. A real portal signs in through its identity provider.</p>
      {error && <p role="alert">No member with that username</p>}
      <form action={login}>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" autoComplete="username" />
        <button>Sign in</button>
      </form>
    </>
  );
}
