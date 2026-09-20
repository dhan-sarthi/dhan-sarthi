# Avatar source images

The stills the avatar provider builds a talking head from. Kept here because a provider's custom
avatar is not a backup: Anam gives this account **one** custom avatar slot, so putting a new face
in means deleting the one that is there, and the only way back is to create it again from the
original image.

| File | Who | Notes |
|---|---|---|
| `uday.jpg` | Uday, the guide | 768×768, Anam's own square crop of the one-shot, downscaled. Deliberately *their* crop and not the original 720×576: the still is what a customer looks at while the call connects, so it has to be framed like the video that replaces it, or the face appears to jump. The text tier shows the same man the call does |
| `priya.png` | Priya, a demo customer | 1152×1152. Held the Anam slot until 20 September 2026, recovered from the provider before the slot was reused |

To put one back:

```bash
curl -X POST https://api.anam.ai/v1/avatars \
  -H "Authorization: Bearer $ANAM_API_KEY" \
  -F "displayName=Uday" -F "imageFile=@packages/assets/avatars/uday.jpg;type=image/jpeg"
```

The id it answers with goes in `ANAM_AVATAR_ID`.
