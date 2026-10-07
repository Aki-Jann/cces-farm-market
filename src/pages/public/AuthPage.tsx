import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
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

type RegistrationFields = {
  firstName: string
  lastName: string
  email: string
  password: string
  birthday: string
  contactNumber: string
  confirmPassword: string
  address: string
}

type RegistrationErrors = Partial<Record<keyof RegistrationFields, string>>

function formatDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value
}

function parseDateInput(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return value
  const [, month, day, year] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return value
  }
  return `${year}-${month}-${day}`
}

function validateRegistrationFields(fields: RegistrationFields): RegistrationErrors {
  const errors: RegistrationErrors = {}
  const normalizedPhone = fields.contactNumber.replace(/[\s()-]/g, '')
  const birthdayDate = fields.birthday ? new Date(`${fields.birthday}T00:00:00`) : null

  if (!fields.firstName.trim()) errors.firstName = 'Enter your first name.'
  if (!fields.lastName.trim()) errors.lastName = 'Enter your last name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errors.email = 'Enter a valid email address.'
  if (!/^(09\d{9}|\+639\d{9})$/.test(normalizedPhone)) errors.contactNumber = 'Enter a valid Philippine phone number.'
  if (!fields.address.trim()) errors.address = 'Enter your address.'
  if (!birthdayDate || Number.isNaN(birthdayDate.getTime()) || birthdayDate > new Date()) {
    errors.birthday = 'Select a valid birthday.'
  }
  if (fields.password.length < 6) errors.password = 'Password must be at least 6 characters.'
  if (!fields.confirmPassword || fields.password !== fields.confirmPassword) {
    errors.confirmPassword = 'Passwords must match.'
  }

  return errors
}

function DateField({
  label,
  value = '',
  onChange,
  error,
}: {
  label: string
  value?: string
  onChange?: (value: string) => void
  error?: string
}) {
  const pickerRef = useRef<HTMLInputElement>(null)
  const [dateText, setDateText] = useState(() => formatDateInput(value))
  const errorId = `${label.replace(/\s+/g, '-').toLowerCase()}-error`

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <div className={styles.dateInputGroup}>
        <input
          className={styles.dateTextInput}
          type="text"
          inputMode="numeric"
          placeholder="MM/DD/YYYY"
          value={dateText}
          onChange={(event) => {
            const nextText = event.target.value
            setDateText(nextText)
            onChange?.(parseDateInput(nextText))
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <input
          ref={pickerRef}
          className={styles.hiddenDatePicker}
          type="date"
          lang="en-US"
          value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
          onChange={(event) => {
            setDateText(formatDateInput(event.target.value))
            onChange?.(event.target.value)
          }}
          tabIndex={-1}
          aria-hidden="true"
        />
        <button
          className={styles.calendarButton}
          type="button"
          aria-label={`Choose ${label.toLowerCase()}`}
          onClick={() => {
            const picker = pickerRef.current
            if (!picker) return
            if ('showPicker' in picker && typeof picker.showPicker === 'function') picker.showPicker()
            else picker.click()
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <rect x="3.5" y="5" width="17" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M4 10h16" />
          </svg>
        </button>
      </div>
      {error && <small className={styles.fieldError} id={errorId}>{error}</small>}
    </label>
  )
}

function Field({ label, placeholder, type = 'text', value, onChange, error }: FieldProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const isPassword = type === 'password'

  return (
    <label className={styles.field}>
      <span>{label}</span>
      {isPassword ? (
        <div className={styles.inputWithAction}>
          <input type={isPasswordVisible ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${label.replace(/\s+/g, '-').toLowerCase()}-error` : undefined} />
          <button
            className={styles.passwordToggle}
            type="button"
            aria-label={`${isPasswordVisible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-pressed={isPasswordVisible}
            onClick={() => setIsPasswordVisible((visible) => !visible)}
          >
            {isPasswordVisible ? 'HIDE' : 'SHOW'}
          </button>
        </div>
      ) : (
        <input type={type} placeholder={placeholder} value={value} onChange={onChange} aria-invalid={Boolean(error)} aria-describedby={error ? `${label.replace(/\s+/g, '-').toLowerCase()}-error` : undefined} />
      )}
      {error && <small className={styles.fieldError} id={`${label.replace(/\s+/g, '-').toLowerCase()}-error`}>{error}</small>}
    </label>
  )
}

export function AuthPage({ type }: { type: AuthType }) {
  const isRegister = type === 'register'
  const isForgot = type === 'forgot-password'
  const [registrationError, setRegistrationError] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginFieldErrors, setLoginFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [loginFields, setLoginFields] = useState({ email: '', password: '' })
  const [resetEmail, setResetEmail] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [showRegistrationErrors, setShowRegistrationErrors] = useState(false)
  const [registrationFields, setRegistrationFields] = useState<RegistrationFields>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    birthday: '',
    contactNumber: '',
    confirmPassword: '',
    address: '',
  })
  const registrationErrors = validateRegistrationFields(registrationFields)
  const isRegistrationValid = Object.keys(registrationErrors).length === 0

  function updateRegistrationField(field: keyof typeof registrationFields) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setRegistrationFields((current) => ({ ...current, [field]: event.target.value }))
    }
  }

  function updateLoginField(field: keyof typeof loginFields) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setLoginFields((current) => ({ ...current, [field]: event.target.value }))
      setLoginFieldErrors((current) => ({ ...current, [field]: undefined }))
      setLoginError('')
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')
    setLoginFieldErrors({})

    const email = loginFields.email.trim()
    const fieldErrors: { email?: string; password?: string } = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = 'Enter a valid email address.'
    }
    if (!loginFields.password) {
      fieldErrors.password = 'Enter your password.'
    }

    if (Object.keys(fieldErrors).length > 0) {
      setLoginFieldErrors(fieldErrors)
      return
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email, loginFields.password)
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
      if (code === 'auth/wrong-password') {
        setLoginFieldErrors({ password: 'Incorrect password.' })
        return
      }
      if (code === 'auth/invalid-credential') {
        setLoginFieldErrors({ password: 'Incorrect email or password.' })
        return
      }
      if (code === 'auth/invalid-email') {
        setLoginFieldErrors({ email: 'Enter a valid email address.' })
        return
      }
      const messages: Record<string, string> = {
        'auth/user-not-found': 'The email or password is incorrect.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'A network error occurred. Check your connection and try again.',
      }
      setLoginError(messages[String(code)] ?? 'Unable to sign in. Please try again.')
    }
  }

  async function sendResetLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResetError('')
    setResetSuccess('')

    const email = resetEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResetError('Enter a valid email address.')
      return
    }

    setIsSendingReset(true)
    try {
      await sendPasswordResetEmail(auth, email)
      setResetSuccess('If an account exists for this email, a password reset link has been sent.')
    } catch (error) {
      console.error('Sending password reset email failed:', error)
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : ''
      const messages: Record<string, string> = {
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/user-not-found': 'No account was found with this email address.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/network-request-failed': 'A network error occurred. Check your connection and try again.',
      }
      setResetError(messages[String(code)] ?? 'Unable to send the reset email. Please try again.')
    } finally {
      setIsSendingReset(false)
    }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRegistrationError('')
    setShowRegistrationErrors(true)
    if (!isRegistrationValid) return
    const birthdayDate = new Date(`${registrationFields.birthday}T00:00:00`)

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
      <main className={`${styles.authCanvas} ${styles.registerCanvas}`}>
        <a className={styles.homeButton} href="#/" aria-label="Back to the landing page">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></svg>
          <span>BACK TO HOME</span>
        </a>
        <form className={`${styles.authCard} ${styles.registerCard}`} onSubmit={register} noValidate>
          <div className={styles.authLogo}><BrandLogo compact /></div>
          <div className={styles.authHeading}>
            <h1>Register</h1>
            <p>Create your account</p>
          </div>
          <div className={styles.registerFields}>
            <Field label="First Name" placeholder="Juan" value={registrationFields.firstName} onChange={updateRegistrationField('firstName')} error={showRegistrationErrors ? registrationErrors.firstName : undefined} />
            <Field label="Last Name" placeholder="Dela Cruz" value={registrationFields.lastName} onChange={updateRegistrationField('lastName')} error={showRegistrationErrors ? registrationErrors.lastName : undefined} />
            <Field label="Email Address" placeholder="name@example.com" type="email" value={registrationFields.email} onChange={updateRegistrationField('email')} error={showRegistrationErrors ? registrationErrors.email : undefined} />
            <Field label="Contact Number" placeholder="09XX XXX XXXX" value={registrationFields.contactNumber} onChange={updateRegistrationField('contactNumber')} error={showRegistrationErrors ? registrationErrors.contactNumber : undefined} />
            <Field label="Address" placeholder="Zone I, Zamboanga City, Philippines" value={registrationFields.address} onChange={updateRegistrationField('address')} error={showRegistrationErrors ? registrationErrors.address : undefined} />
            <DateField label="Birthday" value={registrationFields.birthday} onChange={(birthday) => setRegistrationFields((current) => ({ ...current, birthday }))} error={showRegistrationErrors ? registrationErrors.birthday : undefined} />
            <Field label="Password" placeholder="Enter Password" type="password" value={registrationFields.password} onChange={updateRegistrationField('password')} error={showRegistrationErrors ? registrationErrors.password : undefined} />
            <Field label="Confirm Password" placeholder="Re-enter Password" type="password" value={registrationFields.confirmPassword} onChange={updateRegistrationField('confirmPassword')} error={showRegistrationErrors ? registrationErrors.confirmPassword : undefined} />
            <div className={styles.registerAction}>
              {registrationError && <p className={styles.registrationError} role="alert">{registrationError}</p>}
              <p>Already have an account? <a href="#/login">Login Here</a></p>
              <button type="submit" className={isRegistrationValid ? styles.submitButton : styles.disabledButton}>Create Account</button>
            </div>
          </div>
        </form>
      </main>
    )
  }

  return (
    <main className={styles.authCanvas}>
      <a className={styles.homeButton} href="#/" aria-label="Back to the landing page">
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></svg>
        <span>BACK TO HOME</span>
      </a>
      <form className={`${styles.authCard} ${isForgot ? styles.forgotCard : ''}`} onSubmit={isForgot ? sendResetLink : login} noValidate>
        <div className={styles.authLogo}><BrandLogo compact /></div>
        <div className={styles.authHeading}>
          <h1>{isForgot ? 'Forgot Password' : 'Welcome Back!'}</h1>
          <p>{isForgot ? 'We’ll email you a reset link' : 'Sign in to your account'}</p>
        </div>
        <div className={styles.authFields}>
          <Field
            label={isForgot ? 'Email' : 'Email Address'}
            placeholder="name@example.com"
            type="email"
            value={isForgot ? resetEmail : loginFields.email}
            onChange={isForgot ? (event) => {
              setResetEmail(event.target.value)
              setResetError('')
              setResetSuccess('')
            } : updateLoginField('email')}
            error={isForgot ? resetError : loginFieldErrors.email}
          />
          {isForgot && resetSuccess && <p className={styles.fieldSuccess} role="status">{resetSuccess}</p>}
          {!isForgot && (
            <div className={styles.passwordGroup}>
              <Field label="Password" placeholder="Enter Password" type="password" value={loginFields.password} onChange={updateLoginField('password')} error={loginFieldErrors.password} />
              <a href="#/forgot-password" className={styles.inlineLink}>Forgot Password?</a>
            </div>
          )}
          {!isForgot && loginError && <p className={styles.registrationError} role="alert">{loginError}</p>}
        </div>
        {!isForgot && (
          <>
            <button type="submit" className={styles.submitButton}>SUBMIT</button>
            <p className={styles.switchPrompt}>New to GreenMarket? <a href="#/register">Register Here</a></p>
          </>
        )}
        {isForgot && (
          <>
            <button className={styles.submitButton} disabled={isSendingReset} type="submit">
              {isSendingReset ? 'SENDING…' : 'SEND RESET LINK'}
            </button>
            <a href="#/login" className={styles.backLink}>Back to Login</a>
          </>
        )}
      </form>
    </main>
  )
}
