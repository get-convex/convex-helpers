#!/usr/bin/env python3
import os
import re
import sys

CLA_TEXT = "By submitting this pull request, I confirm that you can use, modify, copy, and redistribute this contribution, under the terms of your choice."

try:
    PR_DESCRIPTION = os.environ["PR_DESCRIPTION"]
except KeyError:
    print("There was no pull request description given")
    sys.exit(1)

if not re.search(re.escape(CLA_TEXT), PR_DESCRIPTION, re.MULTILINE):
    print(
        "Pull request description does not include the required CLA text. Please add the following text to your PR description:\n\n" + CLA_TEXT
    )
    sys.exit(1)
