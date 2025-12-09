const ImageKit = require("imagekit");

const imagekit = new ImageKit({
  publicKey:
    process.env.IMAGEKIT_PUBLIC_KEY || "public_jVavAyCMNkjV+HdqHKWY/T6JF2k=",
  privateKey:
    process.env.IMAGEKIT_PRIVATE_KEY || "private_6hOheIiuUhUi+c+SnBSuGxPXYZo=",
  urlEndpoint:
    process.env.IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/alt5i0gkh",
});

module.exports = imagekit;
