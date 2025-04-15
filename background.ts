import type { PlasmoMessaging } from "@plasmohq/messaging"

// Handler for message passing
export const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  if (req.name === "extractEmailData") {
    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (!tab || !tab.id) {
        return res.send({ success: false, error: "No active tab found" })
      }

      // Try direct script execution for reliability
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Basic extraction right in the execute script function
            const fromElement = document.querySelector("[data-hovercard-id]")
            const subjectElement = document.querySelector(
              "h2[data-thread-perm-id]"
            )
            const bodyElement = document.querySelector(".a3s.aiL")

            let fromName = "",
              fromEmail = ""
            if (fromElement) {
              fromName =
                fromElement.getAttribute("name") ||
                fromElement.innerText?.split("<")[0]?.trim() ||
                ""
              const emailMatch = fromElement.innerText?.match(/<(.+?)>/)
              fromEmail = emailMatch
                ? emailMatch[1]
                : fromElement.getAttribute("data-hovercard-id") || ""
            }

            const subject = subjectElement ? subjectElement.innerText : ""
            const body = bodyElement ? bodyElement.innerText : ""

            return {
              from: {
                name: fromName,
                email: fromEmail
              },
              subject,
              body:
                body?.substring(0, 500) +
                (body && body.length > 500 ? "..." : ""),
              date: new Date().toISOString()
            }
          }
        })

        if (results && results[0] && results[0].result) {
          return res.send({ success: true, data: results[0].result })
        }
      } catch (directError) {
        console.error("Direct script execution failed:", directError)
      }

      // Fallback to content script communication with a timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Content script communication timed out")),
          3000
        )
      )

      const sendMessagePromise = new Promise(async (resolve) => {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: "extractEmailData"
          })
          resolve(response)
        } catch (error) {
          resolve({
            success: false,
            error: "Content script communication failed"
          })
        }
      })

      // Race between timeout and actual response
      const response = (await Promise.race([
        sendMessagePromise,
        timeoutPromise
      ])) as any

      // If we got a valid response
      if (response && response.success && response.data) {
        return res.send(response)
      }

      // If we're here, both approaches failed
      res.send({
        success: false,
        error:
          "Failed to extract email data. Make sure you have a Gmail email open."
      })
    } catch (error) {
      console.error("Error in background handler:", error)
      res.send({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      })
    }
  }
}
