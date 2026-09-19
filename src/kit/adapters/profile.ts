import type { QueryResult } from "../lib/query-result";
import type { AccessPermission } from "../components/access/types";

/** The signed-in person, as the profile page needs them. */
export interface ProfileUser {
  id: string;
  name: string | null;
  email: string;
  /** The role key or name the project uses, e.g. "accountant". The page only shows it. */
  roleName: string;
  /** Permission keys this person holds right now, role and personal exceptions already merged. */
  permissions: string[];
  /** Url of the profile picture, or null when there is none. */
  pictureUrl: string | null;
}

export interface ProfileAdapter {
  useProfile(): QueryResult<ProfileUser>;
  /** Every grantable permission, so the page can show what is held and what is not. */
  usePermissionCatalogue(): QueryResult<AccessPermission[]>;
  updateName(input: { name: string }): Promise<void>;
  /** Left out when a project keeps the sign-in email in an administrator's hands. */
  updateEmail?(input: { email: string }): Promise<void>;
  /** Left out when a project signs people in through an outside identity provider. */
  changePassword?(input: { currentPassword: string; newPassword: string }): Promise<void>;
  /** Stores the picture and answers with the url to show from now on. */
  uploadPicture(input: { file: File }): Promise<string>;
  removePicture(): Promise<void>;
  /** Shortest password the project accepts. */
  passwordMinLength: number;
  /** Largest picture the project accepts, in bytes. */
  maxPictureSizeBytes: number;
  /** Image types the project accepts, e.g. ["image/png", "image/jpeg"]. */
  acceptedPictureTypes: string[];
}
