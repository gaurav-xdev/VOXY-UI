import LegalLayout, { Configured, Section } from "./LegalLayout";
import { TextLink } from "@/ui/primitives";

export default function Refunds() {
  return (
    <LegalLayout eyebrow="LEGAL" title="Refunds & Cancellation" intro="How to cancel a subscription and how refunds are handled.">
      {(l) => (
        <>
          <Section title="Cancelling">
            <p>
              Sign in, open your <TextLink to="/account">account page</TextLink> and choose <em>Cancel subscription</em>. Your plan stays active until the end of the period you've
              already paid for, then stops renewing. You can change your mind before that date by choosing <em>Keep my subscription</em>. You can also manage payment details
              through the billing portal linked from your account page.
            </p>
          </Section>
          <Section title="Refunds">
            <p>
              Refund terms (eligibility, time limits, statutory withdrawal rights in your region) must be defined by the operator:{" "}
              <Configured value={l.reviewed ? "See the operator's final policy." : null} label="refund policy" />.
            </p>
          </Section>
          <Section title="Failed payments">
            <p>
              If a renewal payment fails, your account shows a payment notice and you can update your payment method from the billing portal. Access may be limited if payment isn't
              recovered after the grace period configured for the service.
            </p>
          </Section>
          <Section title="Need help?">
            <p>
              Contact <Configured value={l.supportEmail ?? l.contactEmail} label="support email" />, or see <TextLink to="/contact">Contact &amp; support</TextLink>.
            </p>
          </Section>
        </>
      )}
    </LegalLayout>
  );
}
