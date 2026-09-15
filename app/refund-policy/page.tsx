import type { Metadata } from 'next';
import Footer from '@/components/Footer';
import { brand } from '@/lib/config';

export const metadata: Metadata = { title: 'Refund Policy & Cancellation · FM4 Therapy' };

export default function RefundPage() {
  return (
    <>
      <section className="legal">
        <div className="container">
          <article className="legal__card">
            <h1>Refund Policy &amp; Cancellation</h1>
            <p className="legal__lead">At Fitness Master Academy, we are committed to ensuring your satisfaction with our Ultimate Back Pain Relief System.</p>
            <p>While we do not provide refunds, we are dedicated to supporting you every step of the way to ensure you achieve the best possible results.</p>

            <h2>Satisfaction Guarantee</h2>
            <p>This system has helped more than <strong>7,000 people</strong> just like you. If you follow this system as it&apos;s designed, we&apos;re confident you&apos;ll see great results.</p>

            <h2>Extra Support</h2>
            <p>If you encounter any issues or feel that the program is not meeting your expectations, our team is here to provide additional support and guidance.</p>

            <h2>How to Request Support</h2>
            <ol>
              <li><strong>Contact Us:</strong> Email <a href={`mailto:${brand.email}`}>{brand.email}</a> with your order details and a description of the issue.</li>
              <li><strong>Personalized Assistance:</strong> Our team will provide assistance tailored to your specific needs.</li>
              <li><strong>Follow-Up:</strong> We&apos;ll check in regularly to monitor your progress and make any necessary adjustments.</li>
            </ol>

            <h2>Cancellation</h2>
            <ol>
              <li><strong>Cancelling your registration:</strong> Your seat, the live sessions, the replay and the WhatsApp community are all unlocked the moment your payment goes through, so a confirmed registration cannot be cancelled. If you can&apos;t make it to a live session, nothing is lost. Replay access is included with every seat. If you&apos;d rather pass your seat to a parent, partner or friend, email us at least 24 hours before Day 1 with their name, email and phone number and we&apos;ll transfer the registration for you.</li>
              <li><strong>If we cancel or reschedule:</strong> In the rare event that we have to postpone or call off a workshop, we&apos;ll notify you by email and on WhatsApp. Your seat is carried over to the next batch automatically, and if those new dates don&apos;t suit you, you may request a full refund of the amount you paid. This is the one situation in which a refund is issued.</li>
            </ol>

            <h2>Commitment to Your Success</h2>
            <p>Remember, you&apos;re not alone — our team is here to support you every step of the way. Trust the process, and you&apos;ll find the relief you&apos;re looking for.</p>

            <p className="legal__sig">Thank you for choosing Fitness Master Academy.<br />We appreciate your trust and are dedicated to helping you succeed.</p>
          </article>
        </div>
      </section>

      <Footer />
    </>
  );
}
