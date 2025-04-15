/// <reference types="node" />

import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton
} from "@clerk/chrome-extension"
import { InboxIcon, RefreshCwIcon, SendIcon } from "lucide-react"
import type { PlasmoCSConfig } from "plasmo"
import React, { useEffect, useState } from "react"

import "./style.css"

// Use the correct environment variable access for Plasmo
const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY
const EXTENSION_URL = chrome.runtime.getURL(".")

if (!PUBLISHABLE_KEY) {
  throw new Error(
    "Please add the PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY to the .env.development file"
  )
}

// Define types for our email data
interface EmailSender {
  name: string
  email: string
}

interface EmailData {
  from: EmailSender
  subject: string
  body: string
  date: string
}

// Define possible send status states
type SendStatus = "sending" | "success" | "error" | null

function IndexPopup() {
  const [emailData, setEmailData] = useState<EmailData | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [sendStatus, setSendStatus] = useState<SendStatus>(null)

  // Function to extract email data from Gmail
  const extractEmailData = async () => {
    setLoading(true)
    setError(null)

    try {
      // Query the active tab to get Gmail content
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (!tabs || tabs.length === 0) {
        throw new Error("No active tab found")
      }

      const tab = tabs[0]

      // Check if we're on Gmail - use a more reliable method
      if (
        !tab ||
        !tab.url ||
        !(
          tab.url.includes("mail.google.com") ||
          tab.url.includes("gmail") ||
          tab.url.startsWith("https://mail.google.")
        )
      ) {
        throw new Error("Please navigate to Gmail to extract email information")
      }

      // Try direct script execution first instead of messaging
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Try to get the most relevant email content by finding the active/open email
            const fromElement = document.querySelector(
              'div[role="main"] span[email]'
            ) as HTMLElement
            const subjectElement = document.querySelector(
              'div[role="main"] h2[data-thread-perm-id]'
            ) as HTMLElement
            const bodyElement = document.querySelector(
              'div[role="main"] .a3s.aiL'
            ) as HTMLElement

            let fromName = "",
              fromEmail = ""
            if (fromElement) {
              fromName =
                fromElement.getAttribute("name") ||
                fromElement.textContent?.trim() ||
                "Unknown Sender"
              fromEmail = fromElement.getAttribute("email") || ""
            }

            const subject = subjectElement ? subjectElement.innerText : ""
            const body = bodyElement ? bodyElement.innerText : ""

            return {
              from: {
                name: fromName,
                email: fromEmail
              },
              subject,
              body: body.substring(0, 500) + (body.length > 500 ? "..." : ""),
              date: new Date().toISOString()
            }
          }
        })

        if (results && results[0] && results[0].result) {
          setEmailData(results[0].result)
          setLoading(false)
          return
        }
      } catch (directError) {
        console.error("Direct script execution failed:", directError)
        // Continue with message-based approach as fallback
      }

      // Fallback to message-based approach
      try {
        // Set timeout to prevent getting stuck
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Extraction timed out")), 5000)
        )

        const messagePromise = chrome.runtime.sendMessage({
          name: "extractEmailData"
        })

        // Race between timeout and actual response
        const response = await Promise.race([messagePromise, timeoutPromise])

        if (response && response.success && response.data) {
          setEmailData(response.data)
        } else {
          throw new Error(
            response?.error ||
              "No email content found. Make sure you have an email open."
          )
        }
      } catch (err) {
        throw err // Re-throw to be caught by the outer catch
      }
    } catch (err) {
      console.error("Error extracting email:", err)
      setError(err.message || "Failed to extract email data")
    } finally {
      setLoading(false)
    }
  }

  // Send data to Frontstep API
  const sendToFrontstep = async () => {
    if (!emailData) return

    setSendStatus("sending")

    try {
      await fetch("https://www.frontstep.ai/api/webhooks/handoff", {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          emailContent: emailData.body,
          organizationId: "org_2vdXxKxQzavEcRv2URXe28avVI3",
          senderEmail: emailData.from.email,
          senderName: emailData.from.name
        })
      })

      // With no-cors mode, we can't read the response
      // but if we got here without throwing, the request was sent
      setSendStatus("success")
      setTimeout(() => setSendStatus(null), 3000)
    } catch (err) {
      console.error("Error sending to Frontstep:", err)
      setSendStatus("error")
      setTimeout(() => setSendStatus(null), 3000)
    }
  }

  // Automatically try to extract email data when signed in or when URL changes
  useEffect(() => {
    const autoExtract = async () => {
      try {
        await extractEmailData()
      } catch (err) {
        // Silent fail on auto-extract
        console.error("Auto-extract failed:", err)
      }
    }

    // Initial extraction
    autoExtract()

    // Set up tab URL change listener
    const tabUpdateListener = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (
        changeInfo.url &&
        tab.active &&
        (tab.url?.includes("mail.google.com") ||
          tab.url?.includes("gmail") ||
          tab.url?.startsWith("https://mail.google."))
      ) {
        autoExtract()
      }
    }

    chrome.tabs.onUpdated.addListener(tabUpdateListener)

    // Cleanup listener on unmount
    return () => {
      chrome.tabs.onUpdated.removeListener(tabUpdateListener)
    }
  }, []) // Empty dependency array since we want this to run once on mount

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl={`${EXTENSION_URL}/popup.html`}
      signInFallbackRedirectUrl={`${EXTENSION_URL}/popup.html`}
      signUpFallbackRedirectUrl={`${EXTENSION_URL}/popup.html`}>
      <div className="plasmo-flex plasmo-flex-col plasmo-min-h-[500px] plasmo-w-[350px] plasmo-bg-white plasmo-rounded-xl plasmo-shadow-lg plasmo-overflow-hidden">
        <header className="plasmo-w-full plasmo-px-4 plasmo-py-3 plasmo-bg-white plasmo-border-b plasmo-border-gray-100">
          <div className="plasmo-flex plasmo-justify-between plasmo-items-center">
            <h1 className="plasmo-text-lg plasmo-font-semibold plasmo-text-gray-900">
              Frontstep
            </h1>
            <SignedIn>
              <UserButton afterSignOutUrl={`${EXTENSION_URL}/popup.html`} />
            </SignedIn>
          </div>
        </header>

        <main className="plasmo-flex-1 plasmo-w-full plasmo-p-4 plasmo-space-y-4">
          <SignedOut>
            <div className="plasmo-text-center plasmo-space-y-3">
              <h2 className="plasmo-text-xl plasmo-font-bold plasmo-text-gray-900">
                Welcome to Frontstep
              </h2>
              <p className="plasmo-text-sm plasmo-text-gray-600">
                Please sign in to continue
              </p>
              <SignInButton mode="modal">
                <button className=" plasmo-text-white plasmo-px-4 plasmo-py-2 plasmo-rounded-lg plasmo-text-sm plasmo-font-medium  plasmo-transition-colors plasmo-shadow-sm !plasmo-bg-orange-500 plasmo-text-white hover:!plasmo-bg-orange-600 plasmo-shadow-sm">
                  Sign In
                </button>
              </SignInButton>
            </div>
          </SignedOut>

          <SignedIn>
            <div className="plasmo-w-full plasmo-space-y-4">
              {loading && (
                <div className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-py-2 plasmo-space-x-2 plasmo-text-gray-600">
                  <RefreshCwIcon className="plasmo-animate-spin plasmo-w-4 plasmo-h-4" />
                  <span className="plasmo-text-sm">Extracting...</span>
                </div>
              )}

              {error && (
                <div className="plasmo-bg-red-50 plasmo-border plasmo-border-red-200 plasmo-text-red-700 plasmo-p-3 plasmo-rounded-lg plasmo-text-sm">
                  <p>{error}</p>
                </div>
              )}

              {!emailData && !loading && !error && (
                <div className="plasmo-bg-blue-50 plasmo-border plasmo-border-blue-200 plasmo-text-blue-700 plasmo-p-3 plasmo-rounded-lg plasmo-text-sm">
                  <p>
                    Navigate to an email in Gmail and click "Extract" to begin.
                  </p>
                </div>
              )}

              {emailData && (
                <div className="plasmo-bg-white plasmo-rounded-lg plasmo-border plasmo-border-gray-200 plasmo-shadow-sm plasmo-overflow-hidden">
                  <div className="plasmo-bg-gray-50 plasmo-px-3 plasmo-py-2 plasmo-border-b plasmo-border-gray-200">
                    <h3 className="plasmo-font-medium plasmo-text-sm plasmo-text-gray-900">
                      Lead Information
                    </h3>
                  </div>
                  <div className="plasmo-p-3 plasmo-space-y-3">
                    <div>
                      <label className="plasmo-block plasmo-text-xs plasmo-font-medium plasmo-text-gray-700 plasmo-mb-1">
                        From
                      </label>
                      <div className="plasmo-bg-gray-50 plasmo-rounded-md plasmo-p-2">
                        <p className="plasmo-font-medium plasmo-text-sm">
                          {emailData.from.name || "Unknown"}
                        </p>
                        <p className="plasmo-text-xs plasmo-text-gray-500">
                          {emailData.from.email}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="plasmo-block plasmo-text-xs plasmo-font-medium plasmo-text-gray-700 plasmo-mb-1">
                        Subject
                      </label>
                      <div className="plasmo-bg-gray-50 plasmo-rounded-md plasmo-p-2">
                        <p className="plasmo-text-sm">{emailData.subject}</p>
                      </div>
                    </div>

                    <div>
                      <label className="plasmo-block plasmo-text-xs plasmo-font-medium plasmo-text-gray-700 plasmo-mb-1">
                        Preview
                      </label>
                      <div className="plasmo-bg-gray-50 plasmo-rounded-md plasmo-p-2 plasmo-max-h-24 plasmo-overflow-y-auto">
                        <p className="plasmo-text-xs plasmo-text-gray-600 plasmo-whitespace-pre-line">
                          {emailData.body}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={sendToFrontstep}
                      disabled={sendStatus === "sending"}
                      className={`plasmo-w-full plasmo-mt-1 plasmo-px-3 plasmo-py-2 plasmo-rounded-md plasmo-text-sm plasmo-font-medium plasmo-flex plasmo-items-center plasmo-justify-center plasmo-space-x-2 plasmo-transition-all ${
                        sendStatus === "sending"
                          ? "plasmo-bg-gray-100 plasmo-text-gray-500 plasmo-cursor-not-allowed"
                          : sendStatus === "success"
                            ? "plasmo-bg-green-600 plasmo-text-white"
                            : sendStatus === "error"
                              ? "plasmo-bg-red-600 plasmo-text-white"
                              : "!plasmo-bg-orange-500 plasmo-text-white hover:!plasmo-bg-orange-600 plasmo-shadow-sm"
                      }`}>
                      {sendStatus === "sending" ? (
                        <>
                          <RefreshCwIcon className="plasmo-w-4 plasmo-h-4 plasmo-animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : sendStatus === "success" ? (
                        <span>Sent!</span>
                      ) : sendStatus === "error" ? (
                        <span>Failed - Try Again</span>
                      ) : (
                        <>
                          <SendIcon className="plasmo-w-4 plasmo-h-4" />
                          <span>Send to Frontstep</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </SignedIn>
        </main>
      </div>
    </ClerkProvider>
  )
}

export default IndexPopup
