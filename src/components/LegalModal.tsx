import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

/**
 * Dark mode only modal for displaying legal content (Terms, Privacy).
 * Renders markdown-like content with proper styling.
 */
export function LegalModal({ isOpen, onClose, title, content }: LegalModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Focus modal when it opens
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  // Handle click outside modal
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop - always dark */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal - always dark mode */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          "relative w-full max-w-2xl max-h-[80vh] mx-4 rounded-lg border shadow-xl",
          "bg-zinc-900 border-zinc-800",
          "flex flex-col animate-fade-in"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <h2
            id="legal-modal-title"
            className="text-lg font-medium text-zinc-100"
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="prose prose-invert prose-sm max-w-none legal-content">
            <LegalContent content={content} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders markdown-like legal content with basic formatting.
 */
function LegalContent({ content }: { content: string }) {
  // Split content into lines and render with basic markdown support
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableHeaders: string[] = [];

  const flushTable = () => {
    if (tableHeaders.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="overflow-x-auto my-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700">
                {tableHeaders.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left text-zinc-400 font-medium">
                    {h.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, ri) => (
                <tr key={ri} className="border-b border-zinc-800">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-zinc-300">
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    tableHeaders = [];
    tableRows = [];
    inTable = false;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Skip empty lines but add spacing
    if (!trimmed) {
      if (inTable) flushTable();
      return;
    }

    // Table detection
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.slice(1, -1).split("|");
      
      // Check if it's a separator row
      if (cells.every(c => /^[-:]+$/.test(c.trim()))) {
        inTable = true;
        return;
      }

      if (!inTable && tableHeaders.length === 0) {
        tableHeaders = cells;
      } else if (inTable) {
        tableRows.push(cells);
      }
      return;
    }

    // Flush table if we hit non-table content
    if (inTable) flushTable();

    // H1
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1 key={index} className="text-xl font-semibold text-zinc-100 mt-6 mb-3 first:mt-0">
          {trimmed.slice(2)}
        </h1>
      );
      return;
    }

    // H2
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2 key={index} className="text-lg font-medium text-zinc-200 mt-6 mb-2">
          {trimmed.slice(3)}
        </h2>
      );
      return;
    }

    // H3
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={index} className="text-base font-medium text-zinc-300 mt-4 mb-2">
          {trimmed.slice(4)}
        </h3>
      );
      return;
    }

    // Horizontal rule
    if (trimmed === "---") {
      elements.push(<hr key={index} className="my-6 border-zinc-700" />);
      return;
    }

    // List items
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <li key={index} className="text-zinc-400 ml-4 list-disc">
          <InlineMarkdown text={trimmed.slice(2)} />
        </li>
      );
      return;
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      elements.push(
        <li key={index} className="text-zinc-400 ml-4 list-decimal">
          <InlineMarkdown text={numMatch[2]} />
        </li>
      );
      return;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      elements.push(
        <blockquote key={index} className="border-l-2 border-zinc-700 pl-4 my-2 text-zinc-500 italic">
          <InlineMarkdown text={trimmed.slice(2)} />
        </blockquote>
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={index} className="text-zinc-400 my-2 leading-relaxed">
        <InlineMarkdown text={trimmed} />
      </p>
    );
  });

  // Flush any remaining table
  if (inTable) flushTable();

  return <>{elements}</>;
}

/**
 * Renders inline markdown formatting (bold, links, etc.)
 */
function InlineMarkdown({ text }: { text: string }) {
  // Process inline formatting
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Bold with **
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Links [text](url)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Find which comes first
    const boldIndex = boldMatch ? remaining.indexOf(boldMatch[0]) : -1;
    const linkIndex = linkMatch ? remaining.indexOf(linkMatch[0]) : -1;

    let firstMatch: { type: "bold" | "link"; match: RegExpMatchArray; index: number } | null = null;

    if (boldIndex >= 0 && (linkIndex < 0 || boldIndex < linkIndex)) {
      firstMatch = { type: "bold", match: boldMatch!, index: boldIndex };
    } else if (linkIndex >= 0) {
      firstMatch = { type: "link", match: linkMatch!, index: linkIndex };
    }

    if (!firstMatch) {
      parts.push(remaining);
      break;
    }

    // Add text before match
    if (firstMatch.index > 0) {
      parts.push(remaining.slice(0, firstMatch.index));
    }

    // Add formatted element
    if (firstMatch.type === "bold") {
      parts.push(
        <strong key={keyIndex++} className="text-zinc-200 font-medium">
          {firstMatch.match[1]}
        </strong>
      );
      remaining = remaining.slice(firstMatch.index + firstMatch.match[0].length);
    } else {
      parts.push(
        <a
          key={keyIndex++}
          href={firstMatch.match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          {firstMatch.match[1]}
        </a>
      );
      remaining = remaining.slice(firstMatch.index + firstMatch.match[0].length);
    }
  }

  return <>{parts}</>;
}

// Privacy Policy content
export const PRIVACY_POLICY = `# OpenSync Privacy Policy

**Last Updated: January 20, 2026**

## Overview

OpenSync (https://www.opensync.dev) is an open source project that provides cloud storage for AI coding sessions. This Privacy Policy explains what information we collect, how we use it, and your rights regarding your data.

**The short version:** We collect minimal data necessary to provide the Service. You own your data. We do not sell your data. You can delete your data at any time.

## Information We Collect

### Account Information

When you create an account, we collect:

- Email address (via WorkOS authentication)
- Name (if provided by your authentication provider)
- Authentication tokens

### Session Data

When you sync coding sessions, we store:

- Session metadata (timestamps, duration, source tool)
- Messages and conversations from your AI coding sessions
- Token counts and usage statistics
- Any content you choose to sync

### Technical Data

We automatically collect:

- API request logs (for debugging and abuse prevention)
- IP addresses (for security purposes)
- Browser and device information (when using the web dashboard)

### Embeddings

We generate vector embeddings of your session content using OpenAI's embedding API to enable semantic search. These embeddings are mathematical representations of your content stored alongside your sessions.

## How We Use Your Information

We use your information to:

1. **Provide the Service** - Store, sync, and display your coding sessions
2. **Enable search** - Power full-text and semantic search across your sessions
3. **Generate statistics** - Show you usage analytics and token counts
4. **Maintain security** - Prevent abuse and unauthorized access
5. **Improve the Service** - Fix bugs and improve functionality

## What We Do NOT Do

We do not:

- Sell, rent, or trade your personal data to third parties
- Use your data for advertising purposes
- Share your data with data brokers
- Train AI models on your specific session content
- Access your sessions without your explicit permission

## Data Storage

Your data is stored using:

- **Convex** - Our backend database provider (https://convex.dev)
- **WorkOS** - Our authentication provider (https://workos.com)

Data is stored in cloud infrastructure and protected using industry-standard security practices.

## Data Retention

- **Active data** - Retained as long as your account exists
- **Deleted sessions** - Removed from active storage immediately upon deletion
- **Backups** - May be retained for up to 30 days for disaster recovery
- **Account deletion** - All data deleted within 30 days of account deletion request

## Your Rights

You have the right to:

### Access Your Data
You can view all your synced sessions and data through the OpenSync dashboard.

### Export Your Data
You can export your sessions in JSON, Markdown, or JSONL format via the API.

### Delete Your Data
You can delete individual sessions or all your data at any time through the dashboard.

### Delete Your Account
Contact the maintainer to request complete account deletion.

## Data Sharing

We share data with third-party services only as necessary to provide the Service:

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| Convex | Database storage | All session data |
| WorkOS | Authentication | Email, auth tokens |
| OpenAI | Embeddings | Session text content |

We do not share your data with any other third parties except:

- When required by law
- To protect our rights or safety
- With your explicit consent

## Public Sessions

If you choose to make a session public:

- The session becomes accessible via a public URL
- Anyone with the link can view the session content
- Public sessions may be indexed by search engines
- You can make a session private again at any time

## API Keys

When you generate an API key:

- The key is hashed and stored securely
- The plain text key is shown only once at creation
- You are responsible for keeping your API key secure
- Compromised keys should be regenerated immediately

## Security

We implement security measures including:

- Encrypted data transmission (HTTPS)
- Secure authentication via WorkOS
- API key hashing
- Access logging and monitoring

However, no method of transmission or storage is 100% secure. You use the Service at your own risk.

## Children's Privacy

OpenSync is not intended for use by children under 13 years of age. We do not knowingly collect personal information from children under 13.

## International Users

If you access the Service from outside the United States, your data will be transferred to and processed in the United States.

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of significant changes by:

- Posting the new Privacy Policy on the website
- Updating the "Last Updated" date

Continued use of the Service after changes constitutes acceptance of the updated policy.

## Open Source

OpenSync is open source software. You can review our code at https://github.com/waynesutton/opensync to see exactly how we handle your data.

## Contact

For privacy-related questions or concerns:

- Open an issue at https://github.com/waynesutton/opensync
- Contact the maintainer directly

## California Privacy Rights

If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):

- Right to know what personal information we collect
- Right to delete your personal information
- Right to opt-out of the sale of personal information (we do not sell your data)
- Right to non-discrimination for exercising your rights

## GDPR Rights

If you are in the European Economic Area, you have rights under GDPR including:

- Right of access
- Right to rectification
- Right to erasure
- Right to data portability
- Right to object to processing

To exercise these rights, contact the maintainer.

---

By using OpenSync, you acknowledge that you have read and understood this Privacy Policy.`;

// Terms of Service content
export const TERMS_OF_SERVICE = `# OpenSync Terms of Service

**Last Updated: January 20, 2026**

## Agreement to Terms

By accessing or using OpenSync (https://www.opensync.dev), including the OpenSync dashboard, API, plugins, and related services (collectively, the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.

OpenSync is an open source project available at https://github.com/waynesutton/opensync under the MIT License. These Terms govern your use of the hosted Service, not the underlying source code.

## Description of Service

OpenSync provides cloud storage and synchronization for AI coding sessions from tools like OpenCode and Claude Code. The Service includes session syncing, full-text search, semantic search, public sharing, API access, and usage statistics.

## Open Source Software

The OpenSync software is licensed under the MIT License:

> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

You may use, modify, and distribute the source code according to the MIT License terms. However, use of the hosted Service at opensync.dev is subject to these Terms.

## Use at Your Own Risk

**THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS.**

You expressly understand and agree that:

1. Your use of the Service is at your sole risk
2. The Service is provided without warranties of any kind, either express or implied
3. OpenSync does not warrant that the Service will be uninterrupted, timely, secure, or error-free
4. Any material downloaded or obtained through the Service is done at your own discretion and risk
5. You are solely responsible for any damage to your computer system or loss of data that results from use of the Service

## Data Ownership

**You own your data.** All session data, messages, and content you sync to OpenSync remains your property. We claim no ownership rights over your data.

By using the Service, you grant OpenSync a limited license to store, process, and display your data solely for the purpose of providing the Service to you.

## Data Sync Acknowledgment

By using OpenSync, you acknowledge and agree that:

1. You are voluntarily syncing your AI coding session data to cloud storage
2. You understand that your data will be stored on third-party infrastructure (Convex)
3. You are responsible for the content you sync, including ensuring you have the right to store such content
4. You may delete your data at any time through the Service dashboard

## No Data Resale

**We will never sell, rent, or trade your personal data or session data to third parties.**

Your data is used solely to provide the Service to you. We do not monetize your data through advertising or data brokerage.

## Data Deletion

You may delete your synced sessions and data at any time through the OpenSync dashboard. Upon deletion:

1. Your data will be removed from active storage
2. Backups may be retained for a reasonable period for disaster recovery purposes
3. Anonymized, aggregated statistics may be retained

To request complete account deletion, contact the Service maintainer.

## User Responsibilities

You agree to:

1. Provide accurate information when creating an account
2. Maintain the security of your API keys and credentials
3. Not use the Service for any illegal purpose
4. Not attempt to gain unauthorized access to the Service or its related systems
5. Not interfere with or disrupt the Service
6. Not use the Service to store or transmit malicious code

## Limitation of Liability

**TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:**

THE MAINTAINER OF OPENSYNC, INCLUDING ANY INDIVIDUALS, EMPLOYEES, CONTRACTORS, AFFILIATES, OR FAMILY MEMBERS ASSOCIATED WITH THE PROJECT, SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM:

1. Your use or inability to use the Service
2. Any unauthorized access to or use of our servers and/or any personal information stored therein
3. Any interruption or cessation of transmission to or from the Service
4. Any bugs, viruses, trojan horses, or the like that may be transmitted to or through the Service
5. Any errors or omissions in any content
6. Any actions taken in response to content posted to the Service

**IN NO EVENT SHALL THE TOTAL LIABILITY OF THE MAINTAINER EXCEED THE AMOUNT YOU PAID TO USE THE SERVICE, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS LESS.**

## Indemnification

You agree to defend, indemnify, and hold harmless the OpenSync maintainer, including any individuals, employees, contractors, affiliates, or family members, from and against any claims, damages, obligations, losses, liabilities, costs, or debt arising from:

1. Your use of and access to the Service
2. Your violation of any term of these Terms
3. Your violation of any third-party right, including any intellectual property or privacy right
4. Any claim that your data caused damage to a third party

## Waiver of Legal Action

By using the Service, you agree that:

1. You will not bring any lawsuit, legal claim, or legal action against the OpenSync maintainer, their family members, employees, or contractors arising from or related to your use of the Service
2. You waive any right to participate in any class action lawsuit against the OpenSync maintainer
3. Any disputes will be resolved through good-faith communication

**This waiver is a material term of your agreement to use the Service.**

## Service Modifications

OpenSync reserves the right to:

1. Modify or discontinue the Service at any time, with or without notice
2. Change these Terms at any time by posting updated Terms to the website
3. Terminate your access to the Service for any reason

Continued use of the Service after any modifications constitutes acceptance of the updated Terms.

## Third-Party Services

The Service uses third-party services including:

- **Convex** for database and backend infrastructure
- **WorkOS** for authentication
- **OpenAI** for embedding generation

Your use of these third-party services is subject to their respective terms and privacy policies.

## Governing Law

These Terms shall be governed by and construed in accordance with the laws of the State of California, United States, without regard to its conflict of law provisions.

## Severability

If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary so that the remaining Terms remain in full force and effect.

## Entire Agreement

These Terms, together with the Privacy Policy, constitute the entire agreement between you and OpenSync regarding use of the Service.

## Contact

For questions about these Terms, please open an issue at https://github.com/waynesutton/opensync or contact the maintainer.

---

By creating an account or using OpenSync, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.`;
