/** Propagate a failed native dialog immediately; it must not be hidden by the window wait. */
async function waitForNativeDesktopWindow(app,dialog){
 const [page]=await Promise.all([app.firstWindow({timeout:60000}),dialog?.done??Promise.resolve()]);return page;
}
module.exports={waitForNativeDesktopWindow};
