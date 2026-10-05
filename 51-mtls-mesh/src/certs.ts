// A private CA for the platform and one certificate per workload, written to certs/ (gitignored, regenerated every run).
// Identities follow SPIFFE: a URI SAN spiffe://<trust domain>/ns/<namespace>/sa/<service account>, as Istio and Linkerd issue.
// Also: a rogue CA with a certificate that claims to be orders, and an expired orders certificate.
import { X509Certificate, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import forge from "node-forge";

export const TRUST_DOMAIN = "mesh.local";
export const spiffe = (sa: string) => `spiffe://${TRUST_DOMAIN}/ns/shop/sa/${sa}`;
export const CERTS = new URL("../certs/", import.meta.url).pathname;

type Issued = { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey; keyPem: string };

function keypair() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const key = forge.pki.privateKeyFromPem(privateKey) as forge.pki.rsa.PrivateKey;
  return { key, pub: forge.pki.setRsaPublicKey(key.n, key.e), keyPem: privateKey };
}

const DAY = 86_400_000;

function ca(cn: string): Issued {
  const { key, pub, keyPem } = keypair();
  const cert = forge.pki.createCertificate();
  cert.publicKey = pub;
  cert.serialNumber = "01" + randomBytes(8).toString("hex");
  cert.validity.notBefore = new Date(Date.now() - DAY);
  cert.validity.notAfter = new Date(Date.now() + 365 * DAY);
  const name = [{ name: "commonName", value: cn }, { name: "organizationName", value: "Samples platform" }];
  cert.setSubject(name);
  cert.setIssuer(name);
  cert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(key, forge.md.sha256.create());
  return { cert, key, keyPem };
}

function leaf(issuer: Issued, sa: string, opts: { dns?: string[]; from?: number; to?: number } = {}): Issued {
  const { key, pub, keyPem } = keypair();
  const cert = forge.pki.createCertificate();
  cert.publicKey = pub;
  cert.serialNumber = "02" + randomBytes(8).toString("hex");
  // Short-lived, like a mesh's workload certificates (Istio's default is 24 hours).
  cert.validity.notBefore = new Date(opts.from ?? Date.now() - 60_000);
  cert.validity.notAfter = new Date(opts.to ?? Date.now() + DAY);
  cert.setSubject([{ name: "commonName", value: sa }]);
  cert.setIssuer(issuer.cert.subject.attributes);
  cert.setExtensions([
    { name: "basicConstraints", cA: false, critical: true },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
    // a sidecar both accepts (server) and makes (client) connections with the same identity
    { name: "extKeyUsage", serverAuth: true, clientAuth: true },
    { name: "subjectAltName", altNames: [{ type: 6, value: spiffe(sa) }, ...(opts.dns ?? []).map((d) => ({ type: 2, value: d }))] },
    { name: "authorityKeyIdentifier", keyIdentifier: issuer.cert.generateSubjectKeyIdentifier().getBytes() },
  ]);
  cert.sign(issuer.key, forge.md.sha256.create());
  return { cert, key, keyPem };
}

function write(name: string, it: Issued) {
  writeFileSync(`${CERTS}${name}.crt`, forge.pki.certificateToPem(it.cert));
  writeFileSync(`${CERTS}${name}.key`, it.keyPem, { mode: 0o644 }); // demo keys: readable by the Envoy container's user
}

export function issueAll() {
  mkdirSync(CERTS, { recursive: true });
  const mesh = ca("Mesh Root CA");
  const rogue = ca("Rogue CA");
  writeFileSync(`${CERTS}ca.crt`, forge.pki.certificateToPem(mesh.cert));
  writeFileSync(`${CERTS}rogue-ca.crt`, forge.pki.certificateToPem(rogue.cert));
  write("payments", leaf(mesh, "payments", { dns: ["payments", "localhost"] }));
  write("orders", leaf(mesh, "orders"));
  write("reports", leaf(mesh, "reports"));
  // claims to be orders, but signed by a CA the platform does not trust
  write("rogue-orders", leaf(rogue, "orders"));
  // a payments impostor: the right name, the wrong CA
  write("rogue-payments", leaf(rogue, "payments", { dns: ["payments", "localhost"] }));
  write("expired-orders", leaf(mesh, "orders", { from: Date.now() - 2 * DAY, to: Date.now() - DAY }));
}

// One line per certificate, for the log and out/certs.txt: who it is, who signed it, until when, and whether the mesh CA verifies it.
export function describeAll(names: string[]) {
  const caCert = new X509Certificate(readFileSync(`${CERTS}ca.crt`));
  return names.map((n) => {
    const c = new X509Certificate(readFileSync(`${CERTS}${n}.crt`));
    const issuer = c.issuer.match(/CN=([^\n]+)/)?.[1] ?? c.issuer;
    const valid = new Date(c.validTo).getTime() > Date.now() && new Date(c.validFrom).getTime() < Date.now();
    return {
      name: n,
      san: c.subjectAltName ?? "",
      issuer,
      validTo: new Date(c.validTo).toISOString().slice(0, 16) + "Z",
      inDate: valid,
      signedByMesh: c.verify(caCert.publicKey),
    };
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  issueAll();
  console.log(`certs: wrote ${CERTS}`);
}
