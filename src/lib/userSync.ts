/**
 * User Sync - Syncs Authelia-authenticated users to Pocketbase
 *
 * This module provides getOrCreate functionality to ensure that when a user
 * authenticates via Authelia, a corresponding record exists in the Pocketbase
 * users collection.
 *
 * Architecture Note:
 * The Pocketbase users collection has API rules that prevent unauthenticated
 * list/view operations for security. This means we can't simply look up if a
 * user exists before creating them. Instead, we use a "try create, fallback
 * to auth" pattern:
 *
 * 1. Attempt to create a new user with a deterministic password
 * 2. If creation succeeds, return the new user
 * 3. If creation fails (email exists), authenticate with the deterministic
 *    password to retrieve the existing user record
 *
 * The deterministic password is derived from the email using SHA-256. This is
 * NOT for security (Authelia handles auth) - it's purely to enable looking up
 * existing users via Pocketbase's auth mechanism.
 *
 * Flow:
 * 1. User authenticates via Authelia (handled by Traefik)
 * 2. Frontend fetches /api/me to get user info from headers
 * 3. syncUser() is called to ensure user exists in Pocketbase
 * 4. Returns the Pocketbase user record (with id, apiKey, etc.)
 */

import { pb } from "./pocketbase";
import { type PocketbaseUser, Collections } from "./types";

/**
 * Input from Authelia headers (via /api/me)
 */
export interface AutheliaUserInfo {
  email: string;
  name?: string;
  groups?: string[];
}

/**
 * Response from user sync operation
 */
export interface SyncUserResult {
  user: PocketbaseUser;
  created: boolean;
}

/**
 * Generate a deterministic password from email.
 * This is NOT for security - Authelia handles authentication.
 * This is purely to enable user lookup via Pocketbase auth.
 *
 * We use SHA-256 hash of email + salt, truncated and formatted to meet
 * Pocketbase password requirements (min 8 chars, mixed case, numbers).
 */
async function getDeterministicPassword(email: string): Promise<string> {
  const salt = "opensync-pocketbase-user-sync-v1";
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase() + salt);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Format: 8 hex chars (lowercase) + 8 hex chars uppercase + "1A!"
  // This ensures the password meets typical requirements
  return hashHex.slice(0, 8) + hashHex.slice(8, 16).toUpperCase() + "1A!";
}

/**
 * Sync user from Authelia headers to Pocketbase.
 *
 * Performs a getOrCreate operation:
 * - Attempts to create user with deterministic password
 * - If email already exists, authenticates to fetch existing record
 * - Updates name if changed
 *
 * Uses email as the autheliaId since Authelia doesn't provide a separate ID.
 *
 * @param authInfo - User info from Authelia headers
 * @returns The Pocketbase user record and whether it was newly created
 */
export async function syncUser(authInfo: AutheliaUserInfo): Promise<SyncUserResult> {
  const { email, name = "" } = authInfo;
  const normalizedEmail = email.toLowerCase().trim();
  const password = await getDeterministicPassword(normalizedEmail);

  try {
    // Attempt 1: Try to create new user
    const newUser = await pb.collection(Collections.USERS).create<PocketbaseUser>({
      email: normalizedEmail,
      emailVisibility: true,
      password: password,
      passwordConfirm: password,
      name: name || "",
      autheliaId: normalizedEmail,
      avatarUrl: "",
      profilePhotoId: "",
      apiKey: "",
      apiKeyCreatedAt: 0,
      enabledAgents: [],
    });

    console.log(`[userSync] Created new user: ${newUser.email} (id: ${newUser.id})`);
    return { user: newUser, created: true };

  } catch (createError: unknown) {
    // Check if this is a "unique constraint" error (user already exists)
    const errorMessage = createError instanceof Error ? createError.message : String(createError);
    const isUniqueError =
      errorMessage.toLowerCase().includes("unique") ||
      errorMessage.toLowerCase().includes("already exists") ||
      (createError as { status?: number })?.status === 400;

    if (!isUniqueError) {
      // Unexpected error - rethrow
      console.error("[userSync] Unexpected error creating user:", createError);
      throw createError;
    }

    // User already exists - authenticate to get the record
    try {
      const authResult = await pb.collection(Collections.USERS).authWithPassword(
        normalizedEmail,
        password
      );

      const existingUser = authResult.record as unknown as PocketbaseUser;
      console.log(`[userSync] Found existing user: ${existingUser.email} (id: ${existingUser.id})`);

      // Update name if it changed
      if (name && name !== existingUser.name) {
        const updatedUser = await pb.collection(Collections.USERS).update<PocketbaseUser>(
          existingUser.id,
          { name }
        );
        console.log(`[userSync] Updated user name to: ${name}`);

        // Clear auth state - we don't want to persist PB auth tokens
        // (we use Authelia headers, not PB sessions)
        pb.authStore.clear();

        return { user: updatedUser, created: false };
      }

      // Clear auth state
      pb.authStore.clear();

      return { user: existingUser, created: false };

    } catch (authError) {
      // Auth failed - this shouldn't happen if we created the user
      // with a deterministic password. Log and rethrow.
      console.error("[userSync] Failed to authenticate existing user:", authError);
      throw new Error(
        `User sync failed for ${normalizedEmail}: ` +
        `Could not create (${errorMessage}) or authenticate (${authError})`
      );
    }
  }
}

/**
 * Get user by ID from Pocketbase.
 * Requires authentication - use with caution.
 *
 * @param userId - Pocketbase user record ID
 * @returns The user record or null if not found/unauthorized
 */
export async function getUserById(userId: string): Promise<PocketbaseUser | null> {
  try {
    const user = await pb.collection(Collections.USERS).getOne<PocketbaseUser>(userId);
    return user;
  } catch {
    return null;
  }
}

/**
 * Get user by email from Pocketbase.
 * Uses authentication to bypass API rules.
 *
 * @param email - User email address
 * @returns The user record or null if not found
 */
export async function getUserByEmail(email: string): Promise<PocketbaseUser | null> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const password = await getDeterministicPassword(normalizedEmail);

    const authResult = await pb.collection(Collections.USERS).authWithPassword(
      normalizedEmail,
      password
    );

    const user = authResult.record as unknown as PocketbaseUser;

    // Clear auth state
    pb.authStore.clear();

    return user;
  } catch {
    return null;
  }
}
