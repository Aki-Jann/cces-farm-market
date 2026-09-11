import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { BrandLogo } from '../../components/common/BrandLogo'
import { auth } from '../../firebase/auth'
import { db } from '../../firebase/firestore'
import styles from './AuthPage.module.css'

export type AuthType = 'login' | 'register' | 'forgot-password'

type FieldProps = {
  label: string
  placeholder?: string
  type?: string
  value?: string
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
  error?: string
}

function Field({ label, placeholder, type = 'text', value, onChange, error }: FieldProps) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input type={type} placeholder={placeholder} value={value} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${label.replace(/\s+/g, '-').toLowerCase()}-error` : undefined} />
      {error && <small className={styles.fieldError} id={`${label.replace(/\s+/g, '-').toLowerCase()}-error`}>{error}</small>}
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
  const [registrationError, setRegistrationError] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginFields, setLoginFields] = useState({ email: '', password: '' })
  const [birthdayError, setBirthdayError] = useState('')
  const [registrationFields, setRegistrationFields] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    birthday: '',
    contactNumber: '',
    confirmPassword: '',
    address: '',
  })

  function updateRegistrationField(field: keyof typeof registrationFields) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setRegistrationFields((current) => ({ ...current, [field]: event.target.value }))
    }
  }

  function updateLoginField(field: keyof typeof loginFields) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setLoginFields((current) => ({ ...current, [field]: event.target.value }))
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')

    try {
      const credential = await signInWithEmailAndPassword(auth, loginFields.email, loginFields.password)
      const profileSnapshot = await getDoc(doc(db, 'users', credential.user.uid))

      if (!profileSnapshot.exists()) {
        setLoginError('Your account profile could not be found. Please contact support.')
        return
      }

      const role = profileSnapshot.data().role
      if (role === 'customer') {
        window.location.hash = '/shop'
        return
      }

      if (role === 'admin') {
        window.location.hash = '/admin'
        return
      }

      setLoginError('Your account has an invalid role. Please contact support.')
    } catch (error) {
      console.error('Login failed:', error)
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : ''
      const messages: Record<string, string> = {
        'auth/invalid-credential': 'The email or password is incorrect.',
        'auth/user-not-found': 'The email or password is incorrect.',
        'auth/wrong-password': 'The email or password is incorrect.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'A network error occurred. Check your connection and try again.',
      }
      setLoginError(messages[String(code)] ?? 'Unable to sign in. Please try again.')
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRegistrationError('')
    setBirthdayError('')
    if (registrationFields.password !== registrationFields.confirmPassword) {
      setRegistrationError('Passwords do not match.')
      return
    }
   const birthdayDate = registrationFields.birthday
  ? new Date(`${registrationFields.birthday}T00:00:00`)
  : null

if (!birthdayDate || Number.isNaN(birthdayDate.getTime())) {
  setBirthdayError('Please select a valid birthday.')
  return
}

    try {
      const credential = await createUserWithEmailAndPassword(auth, registrationFields.email, registrationFields.password)
      await setDoc(doc(db, 'users', credential.user.uid), {
        firstName: registrationFields.firstName,
        lastName: registrationFields.lastName,
        email: registrationFields.email,
        birthday: Timestamp.fromDate(birthdayDate),
        contactNumber: registrationFields.contactNumber,
        address: registrationFields.address,
        role: 'customer',
        customerType: 'individual',
        farmNotes: '',
        createdAt: serverTimestamp(),
      })
      window.location.hash = '/shop'
    } catch (error) {
      console.error('Registration failed:', error)
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : ''
      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'That email is already in use. Try logging in instead.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/weak-password': 'Choose a stronger password.',
        'auth/network-request-failed': 'A network error occurred. Check your connection and try again.',
      }
      setRegistrationError(messages[String(code)] ?? 'Unable to create your account. Please try again.')
    }
  }

  if (isRegister) {
    return (
      <main className={styles.authCanvas}>
        <form className={`${styles.authCard} ${styles.registerCard}`} onSubmit={register}>
          <div className={styles.authLogo}><BrandLogo /></div>
          <div className={styles.authHeading}>
            <h1>Register</h1>
            <p>Create your account</p>
          </div>
          <div className={styles.registerFields}>
            <Field label="First Name" placeholder="Juan" value={registrationFields.firstName} onChange={updateRegistrationField('firstName')} />
            <Field label="Email Address" placeholder="name@example.com" type="email" value={registrationFields.email} onChange={updateRegistrationField('email')} />
            <Field label="Last Name" placeholder="Dela Cruz" value={registrationFields.lastName} onChange={updateRegistrationField('lastName')} />
            <Field label="Password" placeholder="Enter Password" type="password" value={registrationFields.password} onChange={updateRegistrationField('password')} />
            <Field label="Birthday" type="date" value={registrationFields.birthday} onChange={updateRegistrationField('birthday')} error={birthdayError} />
            <Field label="Contact Number" placeholder="09XX XXX XXXX" value={registrationFields.contactNumber} onChange={updateRegistrationField('contactNumber')} />
            <Field label="Confirm Password" placeholder="Re-enter Password" type="password" value={registrationFields.confirmPassword} onChange={updateRegistrationField('confirmPassword')} />
            <Field label="Address" placeholder="Zone I, Zamboanga City, Philippines" value={registrationFields.address} onChange={updateRegistrationField('address')} />
            <div className={styles.registerAction}>
              {registrationError && <p className={styles.registrationError} role="alert">{registrationError}</p>}
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
      <form className={`${styles.authCard} ${isForgot ? styles.forgotCard : ''}`} onSubmit={isForgot ? (event) => submitMock(event, '/login') : login}>
        <div className={styles.authLogo}><BrandLogo /></div>
        <div className={styles.authHeading}>
          <h1>{isForgot ? 'Forgot Password' : 'Welcome Back!'}</h1>
          <p>{isForgot ? 'We’ll email you a reset link' : 'Sign in to your account'}</p>
        </div>
        <div className={styles.authFields}>
          <Field
            label={isForgot ? 'Email' : 'Email Address'}
            placeholder="name@example.com"
            type="email"
            value={isForgot ? undefined : loginFields.email}
            onChange={isForgot ? undefined : updateLoginField('email')}
          />
          {!isForgot && (
            <div className={styles.passwordGroup}>
              <Field label="Password" placeholder="Enter Password" type="password" value={loginFields.password} onChange={updateLoginField('password')} />
              <a href="#/forgot-password" className={styles.inlineLink}>Forgot Password?</a>
            </div>
          )}
        </div>
        {!isForgot && (
          <>
            {loginError && <p className={styles.registrationError} role="alert">{loginError}</p>}
            <button type="submit" className={styles.submitButton}>SUBMIT</button>
            <p className={styles.switchPrompt}>New to Roots&Routes? <a href="#/register">Register Here</a></p>
          </>
        )}
        {isForgot && <a href="#/login" className={styles.backLink}>Back to Login</a>}
      </form>
    </main>
  )
}
