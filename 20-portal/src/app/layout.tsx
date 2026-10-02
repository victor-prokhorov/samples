import type { ReactNode } from "react";

export const metadata = { title: "Member portal" };

const css = `
  body { font-family: system-ui, sans-serif; margin: 0; color: #0b0c0c; }
  header { background: #0b0c0c; color: #fff; padding: .75rem 1.5rem; display: flex; gap: 1.5rem; }
  header a { color: #fff; }
  main { padding: 1.5rem; max-width: 42rem; }
  label { display: block; font-weight: bold; margin-top: 1rem; }
  input { display: block; padding: .4rem; border: 2px solid #0b0c0c; }
  input[aria-invalid=true] { border-color: #b10e1e; }
  .error, [role=alert] { color: #b10e1e; font-weight: bold; margin: .25rem 0; }
  button { margin-top: 1.5rem; background: #00703c; color: #fff; border: 0; padding: .6rem 1rem; font-size: 1rem; }
  table { border-collapse: collapse; } td, th { padding: .3rem .8rem; border-bottom: 1px solid #b1b4b6; text-align: left; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <style>{css}</style>
        <header>
          <strong>Member portal</strong>
          <nav aria-label="Main">
            <a href="/profile">Profile</a> <a href="/contributions">Contributions</a> <a href="/address">Change address</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
