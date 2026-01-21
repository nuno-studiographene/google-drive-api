/**
 * @file Authentication Provider component
 * @description Provides authentication context and initialization for Google Identity Services
 * and Google API client to child components.
 */

import React, { useState, useEffect, ReactNode } from 'react'
import { initGIS, signIn as gisSignIn, signInSilently, signOut as gisSignOut } from '../services/auth'
import { initGapiClient } from '../services/googleApi'
import { AuthContext } from './AuthContext.ts'

const TOKEN_STORAGE_KEY = 'google_drive_access_token'

interface StoredToken {
	accessToken: string
	expiresAt: number
}

/**
 * Props for AuthProvider component
 * @interface AuthProviderProps
 * @property {ReactNode} children - Child components to be wrapped by the provider
 */
interface AuthProviderProps {
	children: ReactNode
}

/**
 * AuthProvider component - Initializes Google services and provides auth context
 * @component
 * @param {AuthProviderProps} props - Component props
 * @param {ReactNode} props.children - Child components to wrap
 * @returns {React.ReactElement} Provider component with authentication context
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
	const [isSignedIn, setIsSignedIn] = useState<boolean>(false)
	const [isInitialized, setIsInitialized] = useState<boolean>(false)
	const [error, setError] = useState<string | null>(null)

	const readStoredToken = (): StoredToken | null => {
		// Reads the stored access token from localStorage if it is still valid.
		const storedValue = localStorage.getItem(TOKEN_STORAGE_KEY)
		if (!storedValue) {
			return null
		}
		try {
			const parsed = JSON.parse(storedValue) as StoredToken
			if (!parsed.accessToken || !parsed.expiresAt) {
				return null
			}
			if (Date.now() >= parsed.expiresAt) {
				return null
			}
			return parsed
		} catch (parseError) {
			console.error('Failed to parse stored token:', parseError)
			return null
		}
	}

	const storeToken = (tokenResponse: google.accounts.oauth2.TokenResponse) => {
		// Persists the access token with its expiry time.
		if (!tokenResponse.access_token) {
			return
		}
		const expiresInMs = tokenResponse.expires_in ? tokenResponse.expires_in * 1000 : 0
		const tokenToStore: StoredToken = {
			accessToken: tokenResponse.access_token,
			expiresAt: Date.now() + expiresInMs,
		}
		localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokenToStore))
	}

	const clearStoredToken = () => {
		// Clears any stored token from localStorage.
		localStorage.removeItem(TOKEN_STORAGE_KEY)
	}

	useEffect(() => {
		const waitForGoogleLibraries = () => {
			return new Promise<void>((resolve, reject) => {
				let attempts = 0
				const maxAttempts = 50 // Wait up to 5 seconds

				const checkLibraries = () => {
					attempts++

					// Check if both gapi and google.accounts are available
					if (typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts) {
						resolve()
					} else if (attempts >= maxAttempts) {
						reject(new Error('Google libraries failed to load. Please check your internet connection and refresh the page.'))
					} else {
						setTimeout(checkLibraries, 100)
					}
				}

				checkLibraries()
			})
		}

		const initializeGoogleLibraries = async () => {
			try {
				// Wait for Google libraries to be available
				await waitForGoogleLibraries()

				// 1. Initialize the GAPI Client (for Drive API calls)
				// We do NOT pass clientId or scopes here anymore.
				await new Promise<void>(resolve => gapi.load('client', resolve))
				await initGapiClient()

				// 2. Initialize the GIS Client (for Login/Auth)
				// We pass a callback that runs whenever a user successfully logs in.
				initGIS(tokenResponse => {
					if (tokenResponse && tokenResponse.access_token) {
						// CRITICAL: Hand the token from GIS over to GAPI
						gapi.client.setToken({ access_token: tokenResponse.access_token })
						storeToken(tokenResponse)
						setIsSignedIn(true)
					}
				})

				const storedToken = readStoredToken()
				if (storedToken) {
					gapi.client.setToken({ access_token: storedToken.accessToken })
					setIsSignedIn(true)
				} else {
					signInSilently()
				}

				setIsInitialized(true)
				setError(null)
			} catch (error) {
				console.error('Error initializing Google libraries:', error)
				const errorMessage =
					error instanceof Error ? error.message : 'Failed to initialize Google Services. Please refresh the page and try again.'
				setError(errorMessage)
				setIsInitialized(false)
			}
		}

		initializeGoogleLibraries()
	}, [])

	/**
	 * Initiates the sign-in process
	 * @function signIn
	 * @returns {void}
	 */
	const signIn = () => {
		// This calls the function in auth.ts which triggers tokenClient.requestAccessToken()
		gisSignIn()
	}

	/**
	 * Signs out the user and clears authentication state
	 * @function signOut
	 * @returns {void}
	 */
	const signOut = () => {
		// Clear the token from GAPI and update state
		gapi.client.setToken(null)
		setIsSignedIn(false)
		clearStoredToken()

		// Optional: Revoke the token via GIS if you want a "hard" logout
		gisSignOut()
	}

	if (error) {
		return (
			<div style={{ padding: '20px', textAlign: 'center' }}>
				<div
					style={{
						backgroundColor: '#f8d7da',
						color: '#721c24',
						padding: '15px',
						borderRadius: '5px',
						marginBottom: '15px',
						border: '1px solid #f5c6cb',
					}}>
					<h3>⚠️ Initialization Error</h3>
					<p>{error}</p>
				</div>
				<button
					onClick={() => window.location.reload()}
					style={{
						padding: '10px 20px',
						backgroundColor: '#007bff',
						color: 'white',
						border: 'none',
						borderRadius: '5px',
						cursor: 'pointer',
						fontSize: '16px',
					}}>
					Reload Page
				</button>
			</div>
		)
	}

	if (!isInitialized) {
		return (
			<div style={{ padding: '20px', textAlign: 'center' }}>
				<div>Initializing Google Services...</div>
				<div style={{ marginTop: '10px', color: '#666', fontSize: '14px' }}>This may take a few seconds</div>
			</div>
		)
	}

	return <AuthContext.Provider value={{ isSignedIn, signIn, signOut }}>{children}</AuthContext.Provider>
}
