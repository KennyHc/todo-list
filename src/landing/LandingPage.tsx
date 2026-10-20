import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { CalendarClock, ListTree, ShieldCheck, type LucideIcon } from 'lucide-react';
import { DemoCard } from './DemoCard';
import { GoogleButton } from './GoogleButton';
import styles from './LandingPage.module.css';
import { ease } from '../styles/motion';

type Props = {
  onSignIn: () => void;
  signingIn?: boolean;
  error?: string | null;
  /** A neutral one-off message, e.g. confirmation that the account was deleted. */
  notice?: string | null;
};

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ListTree,
    title: 'Break it down',
    text: 'Big tasks become small steps. Difficulty adds up, so you see the real size.',
  },
  {
    icon: CalendarClock,
    title: 'Deadlines, sorted',
    text: "Add a date and a #tag as you type. See what's due, soonest first.",
  },
  {
    icon: ShieldCheck,
    title: 'Private & everywhere',
    text: 'Your list is yours alone, synced across every device you sign in on.',
  },
];

function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={styles.mark}>
      <rect width="18" height="18" rx="5" fill="var(--accent)" />
      <path
        d="M5 9.4l2.7 2.7L13 6.2"
        fill="none"
        stroke="var(--check-ink)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Fades and rises its children in once, staggered, when scrolled into view. */
function Reveal({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section';
}) {
  const reduced = useReducedMotion();
  const Tag = as === 'section' ? motion.section : motion.div;
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduced ? 0 : 0.08 } },
  };
  return (
    <Tag
      className={className}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
    >
      {children}
    </Tag>
  );
}

function Item({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const variants: Variants = reduced
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: ease.out } },
      };
  return (
    <motion.div className={className} variants={variants}>
      {children}
    </motion.div>
  );
}

export function LandingPage({ onSignIn, signingIn = false, error = null, notice = null }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className={styles.page}>
      <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ''}`}>
        <div className={styles.navInner}>
          <a className={styles.brand} href="/" aria-label="Tasks">
            <Logo />
            <span className={styles.wordmark}>Tasks</span>
          </a>
          <button type="button" className={styles.ghost} onClick={onSignIn} disabled={signingIn}>
            Sign in
          </button>
        </div>
      </header>

      <main>
        <Reveal as="section" className={`${styles.hero} ${styles.wrap}`}>
          <Item className={styles.chip}>
            <span>Free · Private · Synced</span>
          </Item>
          <Item>
            <h1 className={styles.h1}>
              Write it down.
              <br />
              <span className={styles.h1Soft}>It&rsquo;s handled.</span>
            </h1>
          </Item>
          <Item>
            <p className={styles.sub}>
              The calmest way to capture todos. Break big ones into small steps, check them off, and
              watch them disappear.
            </p>
          </Item>
          <Item className={styles.cta}>
            <GoogleButton onClick={onSignIn} loading={signingIn} />
            <p className={styles.fine}>No credit card. No setup. One click.</p>
            {notice && (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            )}
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </Item>
        </Reveal>

        <Reveal as="section" className={`${styles.demo} ${styles.wrap}`}>
          <Item>
            <DemoCard />
          </Item>
        </Reveal>

        <Reveal as="section" className={`${styles.features} ${styles.wrap}`}>
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <Item key={title} className={styles.feature}>
              <span className={styles.tile}>
                <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
              </span>
              <h2 className={styles.featureTitle}>{title}</h2>
              <p className={styles.featureText}>{text}</p>
            </Item>
          ))}
        </Reveal>

        <Reveal as="section" className={`${styles.keys} ${styles.wrap}`}>
          <Item className={styles.keyStrip}>
            <span>Fast by design &mdash;</span>
            <span className={styles.keyItem}>
              <kbd className={styles.kbd}>N</kbd> new
            </span>
            <span className={styles.keyItem}>
              <kbd className={styles.kbd}>X</kbd> done
            </span>
            <span className={styles.keyItem}>
              <kbd className={styles.kbd}>⌘K</kbd> search
            </span>
          </Item>
        </Reveal>

        <Reveal as="section" className={`${styles.closing} ${styles.wrap}`}>
          <Item>
            <h2 className={styles.closingTitle}>Your next todo is one click away.</h2>
          </Item>
          <Item className={styles.cta}>
            <GoogleButton onClick={onSignIn} loading={signingIn} />
          </Item>
        </Reveal>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.footerInner} ${styles.wrap}`}>
          <span>© 2026 Tasks</span>
          <nav className={styles.links} aria-label="Legal">
            <a href="/privacy.html">Privacy</a>
            <a href="/terms.html">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
