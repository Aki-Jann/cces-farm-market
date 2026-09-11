import type { FormEvent } from 'react'
import { BrandLogo } from './BrandLogo'
import styles from './AuthPage.module.css'

export type AuthType = 'login' | 'register' | 'forgot-password'

type FieldProps = {
  label: string
  placeholder: string
  type?: string
}

function Field({ label, placeholder, type = 'text' }: FieldProps) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input type={type} placeholder={placeholder} />
    </label>
  )
}

function submitMock(event: FormEvent<HTMLFormElement>, destination: string) {
  event.preventDefault()
  window.location.hash = destination
}

export function AuthPage({ type }: { type: AuthType }) {
  const isRegister = type === 'register'
  const isForgot = type === 'forgot-password'

  if (isRegister) {
    return (
      <main className={styles.authCanvas}>
        <form className={`${styles.authCard} ${styles.registerCard}`} onSubmit={(event) => submitMock(event, '/login')}>
          <BrandLogo />
          <div className={styles.authHeading}>
            <h1>Register</h1>
            <p>Create your account</p>
          </div>
          <div className={styles.registerFields}>
            <Field label="First Name" placeholder="Juan" />
            <Field label="Email Address" placeholder="name@example.com" type="email" />
            <Field label="Last Name" placeholder="Dela Cruz" />
            <Field label="Password" placeholder="Enter Password" type="password" />
            <Field label="Birthday" placeholder="mm/dd/yyyy" />
            <Field label="Contact Number" placeholder="09XX XXX XXXX" />
            <Field label="Confirm Password" placeholder="Re-enter Password" type="password" />
            <Field label="Address" placeholder="Zone I, Zamboanga City, Philippines" />
            <div className={styles.registerAction}>
              <p>Already have an account? <a href="#/login">Login Here</a></p>
              <button type="submit" className={styles.disabledButton}>Create Account</button>
            </div>
          </div>
        </form>
      </main>
    )
  }

  return (
    <main className={styles.authCanvas}>
      <form className={`${styles.authCard} ${isForgot ? styles.forgotCard : ''}`} onSubmit={(event) => submitMock(event, isForgot ? '/login' : '/shop')}>
        <BrandLogo />
        <div className={styles.authHeading}>
          <h1>{isForgot ? 'Forgot Password' : 'Welcome Back!'}</h1>
          <p>{isForgot ? 'We’ll email you a reset link' : 'Sign in to your account'}</p>
        </div>
        <div className={styles.authFields}>
          <Field label={isForgot ? 'Email' : 'Email Address'} placeholder="name@example.com" type="email" />
          {!isForgot && (
            <div className={styles.passwordGroup}>
              <Field label="Password" placeholder="Enter Password" type="password" />
              <a href="#/forgot-password" className={styles.inlineLink}>Forgot Password?</a>
            </div>
          )}
        </div>
        {!isForgot && (
          <>
            <button type="submit" className={styles.submitButton}>SUBMIT</button>
            <p className={styles.switchPrompt}>New to Roots&Routes? <a href="#/register">Register Here</a></p>
          </>
        )}
        {isForgot && <a href="#/login" className={styles.backLink}>Back to Login</a>}
      </form>
    </main>
  )
}
