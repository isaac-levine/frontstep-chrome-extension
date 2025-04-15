import type { PlasmoCSConfig } from "plasmo"

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

// Export the config
export const config: PlasmoCSConfig = {
  matches: ["https://mail.google.com/*"],
  all_frames: false
}

// Function to extract email data
function extractEmailData(): EmailData | null {
  try {
    // Get the email header details
    const fromElement = document.querySelector(
      "[data-hovercard-id]"
    ) as HTMLElement | null
    const subjectElement = document.querySelector(
      "h2[data-thread-perm-id]"
    ) as HTMLElement | null
    const bodyElement = document.querySelector(".a3s.aiL") as HTMLElement | null

    // Extract sender name and email
    let fromName = "",
      fromEmail = ""
    if (fromElement) {
      fromName =
        fromElement.getAttribute("name") ||
        fromElement.innerText.split("<")[0].trim()
      const emailMatch =
        fromElement.innerText.match(/<(.+?)>/) ||
        fromElement.getAttribute("data-hovercard-id")
      fromEmail = emailMatch
        ? emailMatch[1]
        : fromElement.getAttribute("data-hovercard-id") || ""
    }

    // Extract subject and body
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
  } catch (err) {
    console.error("Error extracting email data:", err)
    return null
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractEmailData") {
    const data = extractEmailData()
    sendResponse({ success: !!data, data })
    return true
  }
})
