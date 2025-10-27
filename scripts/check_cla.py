#!/usr/bin/env python3
import os
import re
import sys
import urllib.error
import urllib.request

CLA_TEXT = "By submitting this pull request, I confirm that you can use, modify, copy, and redistribute this contribution, under the terms of your choice."
ORGANIZATION = "get-convex"

def is_org_member(username, github_token):
    """
    Check if a user is a member of the get-convex GitHub organization.
    Returns True if the user is a confirmed member.
    Returns None if the check fails or membership cannot be determined.
    """
    try:
        # GitHub API endpoint to check organization membership
        url = f"https://api.github.com/orgs/{ORGANIZATION}/members/{username}"
        
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        
        if github_token:
            headers["Authorization"] = f"Bearer {github_token}"
        
        request = urllib.request.Request(url, headers=headers)
        
        # Try to fetch the membership status
        # A 204 response means the user is a confirmed member
        # A 404 response could mean: not a member, membership is private, or org doesn't exist
        # In all uncertain cases, we return None to fall back to CLA check
        try:
            with urllib.request.urlopen(request) as response:
                if response.status == 204:
                    return True
                return None
        except urllib.error.HTTPError as e:
            if e.code == 404:
                # Cannot determine membership - could be private or user is not a member
                return None
            # For other HTTP errors, return None to indicate failure
            return None
            
    except Exception as e:
        print(f"Warning: Failed to check organization membership: {e}")
        return None

def main():
    # Get PR description
    try:
        PR_DESCRIPTION = os.environ["PR_DESCRIPTION"]
    except KeyError:
        print("There was no pull request description given")
        sys.exit(1)
    
    # Get PR author username
    PR_AUTHOR = os.environ.get("PR_AUTHOR")
    GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
    
    # Check if the author is a member of get-convex organization
    if PR_AUTHOR:
        member_status = is_org_member(PR_AUTHOR, GITHUB_TOKEN)
        
        if member_status is True:
            print(f"Skipping CLA check: {PR_AUTHOR} is a member of the {ORGANIZATION} organization (Convex employee)")
            sys.exit(0)
        elif member_status is None:
            print(f"Warning: Could not verify organization membership for {PR_AUTHOR}. Proceeding with CLA check.")
    else:
        print("Warning: PR_AUTHOR environment variable not set. Proceeding with CLA check.")
    
    # Proceed with standard CLA check
    if not re.search(re.escape(CLA_TEXT), PR_DESCRIPTION, re.MULTILINE):
        print(
            "Pull request description does not include the required CLA text. Please add the following text to your PR description:\n\n" + CLA_TEXT
        )
        sys.exit(1)
    
    print("CLA text found in PR description")

if __name__ == "__main__":
    main()
