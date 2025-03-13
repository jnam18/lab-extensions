import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';


import {
  NotebookPanel, INotebookTracker
} from '@jupyterlab/notebook';

import {
  URLExt
} from '@jupyterlab/coreutils';

import {
  showErrorMessage,
  showDialog
} from '@jupyterlab/apputils';

import { DialogWidget } from './dialog'


const extension: JupyterFrontEndPlugin<void> = {
  id: "@jupyterlab-nbgallery/inject-uuid",
  autoStart: true,
  requires: [INotebookTracker],
  activate: (
    app: JupyterFrontEnd,
    notebooks: INotebookTracker
  ) => {
    notebooks.forEach(injectUUID)
    notebooks.widgetAdded.connect((_, a) => injectUUID(a))
  },
};
function inject(panel: NotebookPanel, gallery_metadata: any): void{
  let kernel = panel.sessionContext.session.kernel;
  console.log(kernel);
  if (kernel.name == "python" || kernel.name == "python3") {
    kernel.requestExecute({ code: "import os; os.environ['NBGALLERY_UUID']='" + gallery_metadata['uuid'] + "'; os.environ['NBGALLERY_GIT_COMMIT_ID']='" + gallery_metadata['git_commit_id'] + "';", silent: true, stop_on_error: true });
    try {
      let metadata_url = URLExt.join(
        'https://nbgallery-antimatter-jnam1.oss.cse-cst.gc.ca/', //TODO: Extract this from gallery metadata
        'notebooks',
        gallery_metadata['uuid'],
        "metadata"
      );

      checkChange(metadata_url, gallery_metadata).then((changed) => {
          if (changed) {
            let title = "Remote Notebook Has Changed";
            let body = new DialogWidget();
            body.content = `The notebook changed.`;
            showDialog({
                title: title,
                body: body
            });
          }})
      } catch (error) {
        showErrorMessage("Staging Failed", "An error occured checking for updates to the specified notebook.  Please ensure that you are logged in to the Gallery.");
      }
  }
  if (kernel.name == "ruby") {
    kernel.requestExecute({ code: "ENV['NBGALLERY_UUID']='" + gallery_metadata['uuid'] + "'", silent: true, stop_on_error: true });
    kernel.requestExecute({ code: "ENV['NBGALLERY_GIT_COMMIT_ID']='" + gallery_metadata['git_commit_id'] + "'", silent: true, stop_on_error: true });
  }
}
function injectUUID(panel: NotebookPanel): void {
  panel.sessionContext.ready.then(() => {
    let gallery_metadata: any;
    let restarting = false;
    let unknown = false;
    gallery_metadata = panel.model.sharedModel.metadata["gallery"];
    if (gallery_metadata && gallery_metadata['uuid']) {
      inject(panel, gallery_metadata);
      panel.sessionContext.statusChanged.connect(() =>{
        if(panel.sessionContext.session.kernel.status == "restarting"){
          restarting=true;
        }
        if(panel.sessionContext.session.kernel.status == "unknown" && restarting){
          // Trying to win the race on a restart kernel-> run all cells
          inject(panel, gallery_metadata);
          unknown=true;
        }
        if((panel.sessionContext.session.kernel.status == "idle" || panel.sessionContext.session.kernel.status == "busy") && restarting && unknown){
          restarting = unknown = false;
          // Fail safe
          inject(panel, gallery_metadata);
        }
      });
    }
  });
}
async function checkChange(metadata_url: any, gallery_metadata: any): Promise<boolean> {
  try {
      var nb_commit = gallery_metadata['commit'];
      const headers: Headers = new Headers();
      headers.set('Accept', 'application/json');
      const response = await fetch(metadata_url, {
          method: 'GET',
          headers: headers
      });
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }
      const json = await response.json()
      const result = await (json.commit_id != nb_commit)
      return result
  } catch (error) {
      console.error(error);
  }    
}
export default extension;
