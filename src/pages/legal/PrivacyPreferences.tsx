import LegalLayout, { Section } from "./LegalLayout";

const COOKIES = [
  { name: "__Host-voxy_session", purpose: "Keeps you signed in. HttpOnly, Secure, SameSite=Strict.", lifetime: "Up to the configured session length; removed when you sign out." },
  {
    name: "__Host-voxy_device",
    purpose: "Marks a browser you've already signed in from, so an attacker guessing your password can't lock you out of your own account. Signed; contains no personal data.",
    lifetime: "Long-lived; removed if you clear cookies.",
  },
];

export default function PrivacyPreferences() {
  return (
    <LegalLayout eyebrow="LEGAL" title="Privacy preferences" intro="VOXY currently uses only strictly necessary cookies, so there is nothing to opt in or out of.">
      {() => (
        <>
          <Section title="Cookies we set">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="w-full text-left text-[14px]">
                <caption className="sr-only">Cookies set by VOXY</caption>
                <thead className="bg-white/[0.04] text-[11px] tracking-[0.2em] text-white/45">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      NAME
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      PURPOSE
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      LIFETIME
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 align-top text-white/60">
                  {COOKIES.map((c) => (
                    <tr key={c.name}>
                      <th scope="row" className="px-4 py-3 font-mono text-[12.5px] font-normal text-white/85">
                        {c.name}
                      </th>
                      <td className="px-4 py-3">{c.purpose}</td>
                      <td className="px-4 py-3">{c.lifetime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Analytics, advertising, third parties">
            <p>
              None are loaded. Fonts are served from VOXY itself, not from a third-party font service. If this changes, this page will offer a choice before anything non-essential
              is used.
            </p>
          </Section>
          <Section title="Motion and effects">
            <p>VOXY follows your device's reduced-motion setting and lowers 3D quality automatically on slower devices or when the tab is in the background.</p>
          </Section>
        </>
      )}
    </LegalLayout>
  );
}
