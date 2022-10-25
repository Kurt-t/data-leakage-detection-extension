import os
import json

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join

import tornado
from tornado.web import StaticFileHandler

from .main import main

class RouteHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def post(self):
        # input_data is a dictionary with a key "name"
        input_data = self.get_json_body()
        input_file_name = input_data["name"]
        abs_file_path = os.path.join(os.getcwd(), input_file_name)
        # check file type
        analysis_path = abs_file_path
        file_prefix, file_suffix = os.path.splitext(input_file_name)
        if file_suffix == '.ipynb':
            # generate a temporary script file from notebook
            # TODO: if name is occupied
            # Or "python3 -m jupyter ..."
            os.system(f"jupyter nbconvert --to script {abs_file_path}")  # TODO: if failed
            analysis_path = os.path.join(os.getcwd(), file_prefix) + '.py'
        result = main(analysis_path)
        data = {'ok': False, 'filename': '', 'log': ''}
        if not isinstance(result, str):  # if no error
            report_file_name = file_prefix + '.html'
            data['ok'] = True
            data['filename'] = report_file_name
            if file_suffix == '.ipynb':
                os.remove(analysis_path)
        self.finish(json.dumps(data))


def setup_handlers(web_app):
    host_pattern = ".*$"
    url_path = "data-leakage-detection"

    base_url = web_app.settings["base_url"]
    route_pattern = url_path_join(base_url, url_path, "detect")
    handlers = [(route_pattern, RouteHandler)]
    web_app.add_handlers(host_pattern, handlers)

    doc_url = url_path_join(base_url, url_path, "report")
    doc_dir = os.getcwd()
    handlers = [("{}/(.*)".format(doc_url), StaticFileHandler, {"path": doc_dir})]  # local root dir of content
    web_app.add_handlers(".*$", handlers)
