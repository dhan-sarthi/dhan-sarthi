# Email to IDBI — AWS access

Copy from the line below. Attach `access-request.md` if they want the technical detail.

---

**Subject:** AWS sandbox account 453866368974 — access needed to deploy

Hi <name>,

Thank you for setting up the AWS account for us.

We have signed in and found that the user we were given, `Atomic_DWM`, does not
currently have permission to do anything in the account. We cannot create a
server, and we cannot even open the built-in terminal (CloudShell). So at the
moment we are not able to deploy our application there.

There are two separate things we need. They are handled by different teams, so
please forward each part to the right person.

---

**1. For the cloud / AWS team**

We need two things on account **453866368974**, region **ap-south-1 (Mumbai)**:

**a) An access key for the user `Atomic_DWM`** — an access key ID and secret. We
cannot create this ourselves, as that permission is also turned off. If you would
prefer to give us a role to assume instead of a key, that works for us too and is
the more secure option — just send us the role name.

**b) Three permissions added to that user.** These are standard AWS policies and
can be attached in a few clicks:

- `AmazonEC2FullAccess`
- `CloudWatchLogsFullAccess`
- `AmazonSSMFullAccess`

A note on the third one: `AmazonSSMFullAccess` lets us log in to the server
without opening the SSH port to the internet. It makes the setup more secure, not
less.

We are only asking for a single server. Our whole application runs together on
one machine, so we do not need databases, containers, load balancers or anything
else from AWS. If your security team would rather grant a narrower custom policy
than the three above, we are happy with that — we can send the exact list of
permissions needed.

---

**2. For the API sandbox team**

This is about the banking API sandbox, not the AWS account.

At the moment the sandbox allows requests from a developer laptop, which you
whitelisted for us earlier. Once our application is running on a server, the
requests will come from the **server's** address instead, and the sandbox will
block them.

Three questions:

1. How long does it take to add a new IP address to the whitelist — same day, or
   is there a formal request process?
2. Can the whitelist hold more than one address at a time? We would like to keep
   a developer address as well as the server address. If only one is allowed,
   adding the server would stop us being able to develop locally.
3. We will give you a fixed IP address for the server, so it only needs to be
   added once and will not change when the server restarts.

We do not have the server address yet — it is created along with the server,
which needs part 1 above. We are asking now so the two steps do not have to
happen one after the other.

---

Our submission deadline is **15 October**, so anything you can do to move these
along would be a big help. Happy to get on a call if that is quicker than email.

Thanks,
Krishna
