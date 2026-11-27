/** The progress window precedes the local service's actual application page. */
async function waitForNativeDesktopWindow(app, dialog) {
  const waitForDesktop = async () => {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const page = app.windows().find(candidate => /^http:\/\/127\.0\.0\.1:/.test(candidate.url()));
      if (page) return page;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw Error('Installed desktop did not reach the local service');
  };
  const [page] = await Promise.all([waitForDesktop(), dialog?.done]);
  return page;
}
module.exports = {waitForNativeDesktopWindow};
