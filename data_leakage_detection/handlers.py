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
        result = main(abs_file_path)
        data = {'ok': False, 'filename': ''}
        if not isinstance(result, str):
            report_file_name = '.'.join(input_file_name.split('.')[:-1]) + '.html'
            data['ok'] = True
            data['filename'] = report_file_name
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
